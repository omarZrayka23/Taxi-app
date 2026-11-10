import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { rentalsApi, ridesApi } from '@/api/endpoints';
import { qk } from '@/api/queries';
import type { Booking, Ride } from '@/api/types';
import { BookingCard, PagedList, RideHistoryCard } from '@/components/lists';
import { Segmented } from '@/components/ui';
import { colors, spacing } from '@/theme';

export default function Activity() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'rides' | 'bookings'>('rides');
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Segmented
          options={[
            { value: 'rides', label: t('activity.rides') },
            { value: 'bookings', label: t('activity.bookings') },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {tab === 'rides' ? (
        <PagedList<Ride>
          key="rides"
          queryKey={qk.rideHistory}
          fetchPage={(p) => ridesApi.list(p)}
          renderItem={(r) => <RideHistoryCard ride={r} perspective="passenger" />}
          emptyTitle={t('activity.noRides')}
          emptyIcon="car-outline"
        />
      ) : (
        <PagedList<Booking>
          key="bookings"
          queryKey={qk.bookings}
          fetchPage={(p) => rentalsApi.bookings(p)}
          renderItem={(b) => (
            <BookingCard booking={b} perspective="renter" onPress={() => router.push(`/booking/${b.id}`)} />
          )}
          emptyTitle={t('activity.noBookings')}
          emptyIcon="key-outline"
        />
      )}
    </View>
  );
}
