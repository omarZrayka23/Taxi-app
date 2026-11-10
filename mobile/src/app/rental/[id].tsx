import { useEffect, useState } from 'react';
import { Alert, Dimensions, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { ApiError } from '@/api/client';
import { rentalsApi } from '@/api/endpoints';
import { qk } from '@/api/queries';
import type { RentalMode } from '@/api/types';
import { fileUrl } from '@/config';
import { errorMessage, formatDate, formatUsd, placeName } from '@/lib/format';
import { CalendarModal, type DateRange } from '@/components/RangeCalendar';
import {
  Banner,
  Button,
  Card,
  ErrorView,
  KeyValue,
  LoadingView,
  Price,
  Row,
  Screen,
  SectionTitle,
  Segmented,
  TextField,
  Txt,
  type IconName,
} from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

const { width } = Dimensions.get('window');

export default function RentalDetail() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ id: string; start?: string; end?: string; mode?: RentalMode }>();
  const id = Number(params.id);
  const [range, setRange] = useState<DateRange>({ start: params.start ?? null, end: params.end ?? null });
  const [mode, setMode] = useState<RentalMode | null>(params.mode ?? null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [note, setNote] = useState('');
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detail = useQuery({ queryKey: qk.rental(id), queryFn: () => rentalsApi.get(id), enabled: !!id });
  const listing = detail.data?.listing;

  // default mode = the first one the car offers
  useEffect(() => {
    if (!listing) return;
    const ok = (m: RentalMode | null) =>
      (m === 'SELF_DRIVE' && listing.selfDrive) || (m === 'WITH_DRIVER' && listing.withDriver);
    if (!ok(mode)) setMode(listing.selfDrive ? 'SELF_DRIVE' : listing.withDriver ? 'WITH_DRIVER' : null);
  }, [listing, mode]);

  const canQuote = !!range.start && !!range.end && !!mode;
  const quote = useQuery({
    queryKey: ['rentals', 'quote', id, range.start, range.end, mode],
    queryFn: () => rentalsApi.quote(id, { startDate: range.start!, endDate: range.end!, mode: mode! }),
    enabled: canQuote,
    retry: false,
  });

  if (detail.isLoading) return <LoadingView />;
  if (detail.isError || !listing) return <ErrorView error={detail.error} onRetry={() => void detail.refetch()} />;

  const modeOptions: { value: RentalMode; label: string }[] = [];
  if (listing.selfDrive) modeOptions.push({ value: 'SELF_DRIVE', label: t('rentalMode.SELF_DRIVE') });
  if (listing.withDriver) modeOptions.push({ value: 'WITH_DRIVER', label: t('rentalMode.WITH_DRIVER') });

  const book = async () => {
    if (!canQuote) return;
    setBooking(true);
    setError(null);
    try {
      const { booking: b } = await rentalsApi.book(id, {
        startDate: range.start!,
        endDate: range.end!,
        mode: mode!,
        note: note.trim() || undefined,
      });
      void qc.invalidateQueries({ queryKey: qk.bookings });
      void qc.invalidateQueries({ queryKey: ['rentals'] });
      Alert.alert(t('rentals.requestSentTitle'), t('rentals.requestSent'));
      router.replace(`/booking/${b.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'LICENSE_REQUIRED') {
        Alert.alert(t('rentals.licenseRequiredTitle'), t('errors.LICENSE_REQUIRED'), [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('rentals.uploadLicense'),
            onPress: () => router.push({ pathname: '/documents', params: { types: 'DRIVER_LICENSE' } }),
          },
        ]);
      } else if (e instanceof ApiError && e.code === 'MIN_DAYS') {
        setError(t('rentals.minDaysError', { count: listing.minDays }));
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setBooking(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      {listing.photos.length ? (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
          {listing.photos.map((p) => (
            <Image key={p.id} source={{ uri: fileUrl(p.url) }} style={styles.photo} resizeMode="cover" />
          ))}
        </ScrollView>
      ) : (
        <View style={[styles.photo, { alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="car-sport" size={64} color={colors.textMuted} />
        </View>
      )}

      <View style={{ padding: spacing.lg }}>
        <Txt variant="title">
          {listing.make} {listing.model}
        </Txt>
        <Txt variant="muted">
          {listing.year} · {placeName(listing.place)}
        </Txt>

        <Row style={{ marginTop: spacing.md, flexWrap: 'wrap' }}>
          <Spec icon="people" label={t('rentals.seats', { count: listing.seats })} />
          <Spec icon="cog" label={t(`transmission.${listing.transmission}`)} />
          <Spec icon="water" label={t(`fuel.${listing.fuelType}`)} />
          <Spec icon="color-palette" label={listing.color} />
        </Row>

        {listing.description ? <Txt style={{ marginTop: spacing.md }}>{listing.description}</Txt> : null}

        <SectionTitle>{t('rentals.prices')}</SectionTitle>
        <Card>
          {listing.selfDrive && listing.pricePerDayUsd != null ? (
            <KeyValue
              label={`${t('rentalMode.SELF_DRIVE')} / ${t('rentals.day')}`}
              value={<Price usd={listing.pricePerDayUsd} size="sm" />}
            />
          ) : null}
          {listing.withDriver && listing.withDriverPricePerDayUsd != null ? (
            <KeyValue
              label={`${t('rentalMode.WITH_DRIVER')} / ${t('rentals.day')}`}
              value={<Price usd={listing.withDriverPricePerDayUsd} size="sm" />}
            />
          ) : null}
          <KeyValue label={t('rentals.deposit')} value={<Price usd={listing.depositUsd} size="sm" />} />
          <KeyValue label={t('rentals.minDays')} value={t('rentals.daysCount', { count: listing.minDays })} />
          <KeyValue label={t('rentals.owner')} value={listing.owner.businessName || listing.owner.name} />
        </Card>

        <SectionTitle>{t('rentals.book')}</SectionTitle>
        {modeOptions.length > 1 ? (
          <Segmented options={modeOptions} value={mode ?? modeOptions[0].value} onChange={setMode} />
        ) : modeOptions.length === 1 ? (
          <Txt variant="muted">{modeOptions[0].label}</Txt>
        ) : null}

        <Pressable style={styles.datePicker} onPress={() => setCalendarOpen(true)}>
          <Ionicons name="calendar" size={22} color={colors.text} />
          <View style={{ flex: 1 }}>
            <Txt variant="small">
              {t('calendar.pickupDate')} → {t('calendar.returnDate')}
            </Txt>
            <Txt style={{ fontWeight: '700' }}>
              {range.start && range.end
                ? `${formatDate(range.start)} → ${formatDate(range.end)}`
                : t('rentals.chooseDates')}
            </Txt>
          </View>
        </Pressable>

        {canQuote ? (
          <Card style={{ marginTop: spacing.md }}>
            {quote.isLoading ? (
              <Txt variant="muted">{t('common.loading')}</Txt>
            ) : quote.isError ? (
              <Txt style={{ color: colors.danger }}>
                {quote.error instanceof ApiError && quote.error.code === 'MIN_DAYS'
                  ? t('rentals.minDaysError', { count: listing.minDays })
                  : errorMessage(quote.error)}
              </Txt>
            ) : quote.data ? (
              <>
                <KeyValue label={t('rentals.days')} value={String(quote.data.days)} />
                <KeyValue label={t('rentals.pricePerDay')} value={formatUsd(quote.data.pricePerDayUsd)} />
                <KeyValue
                  label={t('rentals.total')}
                  value={<Price usd={quote.data.totalUsd} lbp={quote.data.totalLbp} />}
                />
                <KeyValue label={t('rentals.deposit')} value={formatUsd(quote.data.depositUsd)} />
                <Txt variant="small" style={{ marginTop: spacing.xs }}>
                  {t('rentals.depositNotice')}
                </Txt>
              </>
            ) : null}
          </Card>
        ) : null}

        {mode === 'SELF_DRIVE' ? <Banner tone="info" icon="card" message={t('rentals.licenseNotice')} /> : null}

        <TextField label={t('rentals.note')} value={note} onChangeText={setNote} multiline maxLength={300} />
        {error ? <Banner tone="danger" icon="alert-circle" message={error} /> : null}
        <Button
          title={t('rentals.requestBooking')}
          onPress={book}
          loading={booking}
          disabled={!canQuote || quote.isError || quote.isLoading}
        />
      </View>

      <CalendarModal
        visible={calendarOpen}
        value={range}
        blocked={detail.data?.unavailable ?? []}
        onClose={() => setCalendarOpen(false)}
        onDone={(r) => {
          setRange(r);
          setCalendarOpen(false);
        }}
      />
    </Screen>
  );
}

function Spec({ icon, label }: { icon: IconName; label: string }) {
  return (
    <Row gap={4} style={styles.spec}>
      <Ionicons name={icon} size={14} color={colors.text} />
      <Txt variant="small" style={{ color: colors.text }}>
        {label}
      </Txt>
    </Row>
  );
}

const styles = StyleSheet.create({
  photo: { width, height: 240, backgroundColor: colors.surface },
  spec: { backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  datePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
});
