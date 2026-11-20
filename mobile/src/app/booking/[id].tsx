import { RefreshControl } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { rentalsApi } from '@/api/endpoints';
import { qk } from '@/api/queries';
import { useAuth } from '@/store/auth';
import { formatDate, formatDateTime, formatUsd } from '@/lib/format';
import { callPhone } from '@/lib/links';
import { BookingCard } from '@/components/lists';
import { OwnerBookingActions, RenterBookingActions } from '@/components/BookingActions';
import {
  Banner,
  Button,
  Card,
  ErrorView,
  KeyValue,
  LoadingView,
  Price,
  Screen,
  SectionTitle,
  Txt,
} from '@/components/ui';

export default function BookingDetail() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookingId = Number(id);
  const me = useAuth((s) => s.user);
  const q = useQuery({
    queryKey: qk.booking(bookingId),
    queryFn: async () => (await rentalsApi.booking(bookingId)).booking,
    enabled: !!bookingId,
  });

  if (q.isLoading) return <LoadingView />;
  if (q.isError || !q.data) return <ErrorView error={q.error} onRetry={() => void q.refetch()} />;
  const b = q.data;
  const isOwner = me?.id === b.owner.id;
  const other = isOwner ? b.renter : b.owner;
  const otherName = isOwner ? b.renter.name : b.owner.businessName || b.owner.name;

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <BookingCard booking={b} perspective={isOwner ? 'owner' : 'renter'} />

      {b.status === 'PENDING' && !isOwner ? (
        <Banner tone="warning" icon="hourglass" message={t('bookings.pendingHint')} />
      ) : null}
      {b.status === 'CONFIRMED' && !isOwner ? (
        <Banner tone="success" icon="checkmark-circle" message={t('bookings.confirmedHint')} />
      ) : null}
      {b.status === 'REJECTED' || (b.status === 'CANCELLED' && b.rejectionReason) ? (
        <Banner
          tone="danger"
          icon="close-circle"
          title={t(`status.${b.status}`)}
          message={b.rejectionReason ?? undefined}
        />
      ) : null}

      <SectionTitle>{t('bookings.details')}</SectionTitle>
      <Card>
        <KeyValue label={t('calendar.pickupDate')} value={formatDate(b.startDate)} />
        <KeyValue label={t('calendar.returnDate')} value={formatDate(b.endDate)} />
        <KeyValue label={t('rentals.days')} value={String(b.days)} />
        <KeyValue label={t('rentals.mode')} value={t(`rentalMode.${b.mode}`)} />
        <KeyValue label={t('rentals.pricePerDay')} value={formatUsd(b.pricePerDayUsd)} />
        <KeyValue label={t('rentals.total')} value={<Price usd={b.totalUsd} lbp={b.totalLbp} size="sm" />} />
        <KeyValue label={t('rentals.deposit')} value={formatUsd(b.depositUsd)} />
        {isOwner ? <KeyValue label={t('bookings.commission')} value={formatUsd(b.commissionUsd)} /> : null}
        <KeyValue label={t('bookings.createdAt')} value={formatDateTime(b.createdAt)} />
        {b.note ? <Txt variant="muted" style={{ marginTop: 6 }}>{`${t('rentals.note')}: ${b.note}`}</Txt> : null}
      </Card>
      <Txt variant="small">{t('rentals.depositNotice')}</Txt>

      <SectionTitle>{isOwner ? t('bookings.renter') : t('rentals.owner')}</SectionTitle>
      <Card>
        <Txt variant="subtitle">{otherName}</Txt>
        <Txt variant="muted" style={{ writingDirection: 'ltr', textAlign: 'left' }}>
          {other.phone}
        </Txt>
        <Button
          title={t('ride.call')}
          icon="call"
          small
          variant="secondary"
          onPress={() => callPhone(other.phone)}
          style={{ marginTop: 8 }}
        />
      </Card>

      {isOwner ? <OwnerBookingActions booking={b} /> : <RenterBookingActions booking={b} />}
    </Screen>
  );
}
