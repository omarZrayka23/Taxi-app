import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ownerApi } from '@/api/endpoints';
import { qk } from '@/api/queries';
import type { Booking, BookingStatus } from '@/api/types';
import { BookingCard, PagedList } from '@/components/lists';
import { OwnerBookingActions } from '@/components/BookingActions';
import { Chip } from '@/components/ui';
import { colors, spacing } from '@/theme';

const FILTERS: (BookingStatus | undefined)[] = [
  undefined,
  'PENDING',
  'CONFIRMED',
  'ACTIVE',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
];

export default function OwnerRequests() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<BookingStatus | undefined>('PENDING');
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, padding: spacing.lg, paddingBottom: 0 }}
        >
          {FILTERS.map((s) => (
            <Chip
              key={s ?? 'ALL'}
              label={s ? t(`status.${s}`) : t('common.all')}
              selected={status === s}
              onPress={() => setStatus(s)}
            />
          ))}
        </ScrollView>
      </View>
      <PagedList<Booking>
        key={status ?? 'ALL'}
        queryKey={qk.ownerBookings(status)}
        fetchPage={(p) => ownerApi.bookings(p, status)}
        renderItem={(b) => (
          <BookingCard
            booking={b}
            perspective="owner"
            onPress={() => router.push(`/booking/${b.id}`)}
            footer={<OwnerBookingActions booking={b} />}
          />
        )}
        emptyTitle={t('owner.noRequests')}
        emptyIcon="calendar-outline"
      />
    </View>
  );
}
