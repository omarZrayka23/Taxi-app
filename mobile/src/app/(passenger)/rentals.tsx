import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { rentalsApi, type RentalFilters } from '@/api/endpoints';
import { qk, usePlaces } from '@/api/queries';
import type { Listing, RentalMode } from '@/api/types';
import { formatDate, placeName } from '@/lib/format';
import { ListingCard } from '@/components/ListingCard';
import { PagedList } from '@/components/lists';
import { CalendarModal, type DateRange } from '@/components/RangeCalendar';
import { Chip } from '@/components/ui';
import { colors, spacing } from '@/theme';

export default function Rentals() {
  const { t } = useTranslation();
  const places = usePlaces();
  const [placeId, setPlaceId] = useState<number | undefined>();
  const [mode, setMode] = useState<RentalMode | undefined>();
  const [range, setRange] = useState<DateRange>({ start: null, end: null });
  const [calendarOpen, setCalendarOpen] = useState(false);

  const filters: RentalFilters = {
    placeId,
    mode,
    startDate: range.start && range.end ? range.start : undefined,
    endDate: range.start && range.end ? range.end : undefined,
  };

  const header = (
    <View style={{ marginBottom: spacing.md }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip
          label={t('rentals.allPlaces')}
          selected={!placeId}
          onPress={() => setPlaceId(undefined)}
          icon="location"
        />
        {(places.data ?? []).map((p) => (
          <Chip key={p.id} label={placeName(p)} selected={placeId === p.id} onPress={() => setPlaceId(p.id)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip
          icon="calendar"
          label={
            range.start && range.end ? `${formatDate(range.start)} → ${formatDate(range.end)}` : t('rentals.anyDates')
          }
          selected={!!range.start && !!range.end}
          onPress={() => setCalendarOpen(true)}
        />
        <Chip label={t('rentals.anyMode')} selected={!mode} onPress={() => setMode(undefined)} />
        <Chip
          label={t('rentalMode.SELF_DRIVE')}
          selected={mode === 'SELF_DRIVE'}
          onPress={() => setMode('SELF_DRIVE')}
        />
        <Chip
          label={t('rentalMode.WITH_DRIVER')}
          selected={mode === 'WITH_DRIVER'}
          onPress={() => setMode('WITH_DRIVER')}
        />
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PagedList<Listing>
        queryKey={qk.rentals(filters)}
        fetchPage={(p) => rentalsApi.list(filters, p)}
        header={header}
        renderItem={(l) => (
          <ListingCard
            listing={l}
            onPress={() =>
              router.push({
                pathname: '/rental/[id]',
                params: {
                  id: String(l.id),
                  ...(filters.startDate ? { start: filters.startDate, end: filters.endDate } : {}),
                  ...(mode ? { mode } : {}),
                },
              })
            }
          />
        )}
        emptyTitle={t('rentals.none')}
        emptyMessage={t('rentals.noneHint')}
        emptyIcon="car-sport-outline"
      />
      <CalendarModal
        visible={calendarOpen}
        value={range}
        onClose={() => setCalendarOpen(false)}
        onDone={(r) => {
          setRange(r);
          setCalendarOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { gap: spacing.sm, paddingBottom: spacing.sm },
});
