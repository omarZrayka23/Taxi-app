import React from 'react';
import { FlatList, Image, RefreshControl, StyleSheet, View } from 'react-native';
import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Booking, Page, Ride } from '@/api/types';
import { fileUrl } from '@/config';
import { formatDate, formatDateTime, formatUsd } from '@/lib/format';
import { Card, EmptyView, ErrorView, LoadingView, Row, StatusBadge, Txt, type IconName } from '@/components/ui';
import { RouteSummary } from '@/components/ride/RideBits';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';
import { ActivityIndicator } from 'react-native';

/** Infinite list over a paginated endpoint ({ items, total, page, pageSize }). */
export function PagedList<T extends { id: number }>({
  queryKey,
  fetchPage,
  renderItem,
  emptyTitle,
  emptyMessage,
  emptyIcon,
  header,
}: {
  queryKey: QueryKey;
  fetchPage: (page: number) => Promise<Page<T>>;
  renderItem: (item: T) => React.ReactElement;
  emptyTitle: string;
  emptyMessage?: string;
  emptyIcon?: IconName;
  header?: React.ReactElement;
}) {
  const q = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const loaded = last.page * last.pageSize;
      return loaded < last.total ? last.page + 1 : undefined;
    },
  });

  if (q.isLoading) return <LoadingView />;
  if (q.isError) return <ErrorView error={q.error} onRetry={() => void q.refetch()} />;
  const items = q.data?.pages.flatMap((p) => p.items ?? []) ?? [];

  return (
    <FlatList
      data={items}
      keyExtractor={(i) => String(i.id)}
      renderItem={({ item }) => renderItem(item)}
      contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
      ListHeaderComponent={header}
      ListEmptyComponent={<EmptyView title={emptyTitle} message={emptyMessage} icon={emptyIcon} />}
      refreshControl={
        <RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => void q.refetch()} />
      }
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
      }}
      ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator style={{ margin: spacing.lg }} /> : undefined}
    />
  );
}

export function RideHistoryCard({ ride, perspective }: { ride: Ride; perspective: 'passenger' | 'driver' }) {
  const { t } = useTranslation();
  const counterpart = perspective === 'passenger' ? ride.driver?.name : ride.passenger?.name;
  const myRating = perspective === 'passenger' ? ride.ratingByPassenger : ride.ratingByDriver;
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', marginBottom: spacing.sm }}>
        <Txt variant="small">{formatDateTime(ride.requestedAt)}</Txt>
        <StatusBadge status={ride.status} />
      </Row>
      <RouteSummary from={ride.pickupAddress} to={ride.dropoffAddress} />
      <Row style={{ justifyContent: 'space-between', marginTop: spacing.sm }}>
        <Txt variant="small">
          {t(`vehicle.${ride.vehicleType}`)}
          {counterpart ? ` · ${counterpart}` : ''}
          {myRating ? ` · ${'★'.repeat(myRating)}` : ''}
        </Txt>
        <Txt style={{ fontWeight: '800' }}>{formatUsd(ride.fareUsd)}</Txt>
      </Row>
      {perspective === 'driver' && ride.status === 'COMPLETED' && ride.commissionUsd > 0 ? (
        <Txt variant="small">{t('driver.commission', { amount: formatUsd(ride.commissionUsd) })}</Txt>
      ) : null}
    </Card>
  );
}

export function BookingCard({
  booking,
  perspective,
  onPress,
  footer,
}: {
  booking: Booking;
  perspective: 'renter' | 'owner';
  onPress?: () => void;
  footer?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const photo = fileUrl(booking.listing.photoUrl);
  const who =
    perspective === 'renter'
      ? booking.owner.businessName || booking.owner.name
      : `${booking.renter.name} · ${booking.renter.phone}`;
  return (
    <Card onPress={onPress}>
      <Row gap={spacing.md} style={{ alignItems: 'flex-start' }}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Ionicons name="car-sport" size={28} color={colors.textMuted} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>
              {booking.listing.make} {booking.listing.model} {booking.listing.year}
            </Txt>
            <StatusBadge status={booking.status} />
          </Row>
          <Txt variant="small">
            {formatDate(booking.startDate)} → {formatDate(booking.endDate)} ·{' '}
            {t('rentals.daysCount', { count: booking.days })}
          </Txt>
          <Txt variant="small">
            {t(`rentalMode.${booking.mode}`)} · {who}
          </Txt>
          <Txt style={{ fontWeight: '800', marginTop: 2 }}>{formatUsd(booking.totalUsd)}</Txt>
        </View>
      </Row>
      {footer}
    </Card>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.surface },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
});
