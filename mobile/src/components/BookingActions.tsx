import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ownerApi, rentalsApi } from '@/api/endpoints';
import type { Booking } from '@/api/types';
import { applyBookingUpdate } from '@/realtime/socket';
import { errorMessage } from '@/lib/format';
import { Button, Row, TextField, Txt } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

type Action = 'confirm' | 'reject' | 'start' | 'complete' | 'cancel';

interface ReasonRequest {
  title: string;
  message: string;
  action: Action;
  booking: Booking;
}

function useBookingAction() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<Action | null>(null);
  const [reasonRequest, setReasonRequest] = useState<ReasonRequest | null>(null);

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

  /** Ask before acting. Reject / cancel also collect an optional reason (works on iOS and Android). */
  const confirmThen = (title: string, message: string, action: Action, booking: Booking, destructive = false) => {
    if (action === 'reject' || action === 'cancel') {
      setReasonRequest({ title, message, action, booking });
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

  const reasonModal = (
    <ReasonModal
      request={reasonRequest}
      onClose={() => setReasonRequest(null)}
      onSubmit={(reason) => {
        const r = reasonRequest;
        setReasonRequest(null);
        if (r) void run(r.action, r.booking, reason);
      }}
    />
  );

  return { busy, run, confirmThen, reasonModal };
}

function ReasonModal({
  request,
  onClose,
  onSubmit,
}: {
  request: ReasonRequest | null;
  onClose: () => void;
  onSubmit: (reason: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const visible = request !== null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onShow={() => setReason('')}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View style={styles.sheet}>
          <Txt variant="subtitle">{request?.title}</Txt>
          <Txt style={{ color: colors.textMuted, marginVertical: spacing.sm }}>{request?.message}</Txt>
          <TextField
            placeholder={t('bookings.reasonOptional')}
            value={reason}
            onChangeText={setReason}
            maxLength={300}
            multiline
          />
          <Row>
            <Button title={t('common.no')} variant="secondary" small style={{ flex: 1 }} onPress={onClose} />
            <Button
              title={t('common.yes')}
              variant="danger"
              small
              style={{ flex: 1 }}
              onPress={() => onSubmit(reason.trim() || undefined)}
            />
          </Row>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Owner actions on a booking: Confirm / Reject (PENDING), Start / Reject (CONFIRMED), Complete (ACTIVE). */
export function OwnerBookingActions({ booking }: { booking: Booking }) {
  const { t } = useTranslation();
  const { busy, run, confirmThen, reasonModal } = useBookingAction();

  const rejectButton = (
    <Button
      title={t('bookings.reject')}
      variant="danger"
      small
      style={{ flex: 1 }}
      loading={busy === 'reject'}
      onPress={() => confirmThen(t('bookings.reject'), t('bookings.rejectConfirm'), 'reject', booking, true)}
    />
  );

  if (booking.status === 'PENDING') {
    return (
      <Row style={{ marginTop: spacing.md }}>
        {rejectButton}
        <Button
          title={t('bookings.confirm')}
          small
          style={{ flex: 1 }}
          loading={busy === 'confirm'}
          onPress={() => void run('confirm', booking)}
        />
        {reasonModal}
      </Row>
    );
  }
  if (booking.status === 'CONFIRMED') {
    return (
      <Row style={{ marginTop: spacing.md }}>
        {rejectButton}
        <Button
          title={t('bookings.start')}
          icon="key"
          small
          style={{ flex: 1 }}
          loading={busy === 'start'}
          onPress={() => confirmThen(t('bookings.start'), t('bookings.startConfirm'), 'start', booking)}
        />
        {reasonModal}
      </Row>
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
  const { busy, confirmThen, reasonModal } = useBookingAction();
  if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') return null;
  return (
    <>
      <Button
        title={t('bookings.cancel')}
        variant="danger"
        style={{ marginTop: spacing.md }}
        loading={busy === 'cancel'}
        onPress={() => confirmThen(t('bookings.cancel'), t('bookings.cancelConfirm'), 'cancel', booking, true)}
      />
      {reasonModal}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
});
