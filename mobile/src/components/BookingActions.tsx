import { useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ownerApi, rentalsApi } from '@/api/endpoints';
import type { Booking } from '@/api/types';
import { applyBookingUpdate } from '@/realtime/socket';
import { errorMessage } from '@/lib/format';
import { Button, Row } from '@/components/ui';
import { spacing } from '@/theme';

type Action = 'confirm' | 'reject' | 'start' | 'complete' | 'cancel';

function useBookingAction() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<Action | null>(null);

  const run = async (action: Action, booking: Booking, reason?: string) => {
    setBusy(action);
    try {
      const fn = {
        confirm: () => ownerApi.confirm(booking.id),
        reject: () => ownerApi.reject(booking.id, reason),
        start: () => ownerApi.start(booking.id),
        complete: () => ownerApi.complete(booking.id),
        cancel: () => rentalsApi.cancelBooking(booking.id, reason),
      }[action];
      const { booking: updated } = await fn();
      applyBookingUpdate(updated);
    } catch (e) {
      Alert.alert(t('common.error'), errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  /** Confirm with an optional free-text reason (iOS prompt; plain confirm elsewhere). */
  const confirmThen = (title: string, message: string, action: Action, booking: Booking, destructive = false) => {
    if (Platform.OS === 'ios' && (action === 'reject' || action === 'cancel')) {
      Alert.prompt(title, t('bookings.reasonOptional'), [
        { text: t('common.no'), style: 'cancel' },
        {
          text: t('common.yes'),
          style: 'destructive',
          onPress: (reason?: string) => void run(action, booking, reason?.trim() || undefined),
        },
      ]);
      return;
    }
    Alert.alert(title, message, [
      { text: t('common.no'), style: 'cancel' },
      {
        text: t('common.yes'),
        style: destructive ? 'destructive' : 'default',
        onPress: () => void run(action, booking),
      },
    ]);
  };

  return { busy, run, confirmThen };
}

/** Owner actions on a booking: Confirm / Reject (PENDING), Start (CONFIRMED), Complete (ACTIVE). */
export function OwnerBookingActions({ booking }: { booking: Booking }) {
  const { t } = useTranslation();
  const { busy, run, confirmThen } = useBookingAction();

  if (booking.status === 'PENDING') {
    return (
      <Row style={{ marginTop: spacing.md }}>
        <Button
          title={t('bookings.reject')}
          variant="danger"
          small
          style={{ flex: 1 }}
          loading={busy === 'reject'}
          onPress={() => confirmThen(t('bookings.reject'), t('bookings.rejectConfirm'), 'reject', booking, true)}
        />
        <Button
          title={t('bookings.confirm')}
          small
          style={{ flex: 1 }}
          loading={busy === 'confirm'}
          onPress={() => void run('confirm', booking)}
        />
      </Row>
    );
  }
  if (booking.status === 'CONFIRMED') {
    return (
      <Button
        title={t('bookings.start')}
        icon="key"
        small
        style={{ marginTop: spacing.md }}
        loading={busy === 'start'}
        onPress={() => confirmThen(t('bookings.start'), t('bookings.startConfirm'), 'start', booking)}
      />
    );
  }
  if (booking.status === 'ACTIVE') {
    return (
      <Button
        title={t('bookings.complete')}
        icon="checkmark-done"
        variant="success"
        small
        style={{ marginTop: spacing.md }}
        loading={busy === 'complete'}
        onPress={() => confirmThen(t('bookings.complete'), t('bookings.completeConfirm'), 'complete', booking)}
      />
    );
  }
  return null;
}

/** Renter action: cancel while PENDING/CONFIRMED. */
export function RenterBookingActions({ booking }: { booking: Booking }) {
  const { t } = useTranslation();
  const { busy, confirmThen } = useBookingAction();
  if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') return null;
  return (
    <Button
      title={t('bookings.cancel')}
      variant="danger"
      style={{ marginTop: spacing.md }}
      loading={busy === 'cancel'}
      onPress={() => confirmThen(t('bookings.cancel'), t('bookings.cancelConfirm'), 'cancel', booking, true)}
    />
  );
}
