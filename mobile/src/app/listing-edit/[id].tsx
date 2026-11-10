import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { ownerApi } from '@/api/endpoints';
import { qk, usePlaces } from '@/api/queries';
import type { FuelType, Listing, ListingInput, Transmission } from '@/api/types';
import { fileUrl } from '@/config';
import { FileTooLargeError, pickImages } from '@/lib/files';
import { errorMessage, placeName } from '@/lib/format';
import { PlacePickerModal } from '@/components/ride/PlacePickerModal';
import {
  Banner,
  Button,
  Chip,
  ErrorView,
  LoadingView,
  Row,
  Screen,
  SectionTitle,
  Segmented,
  StatusBadge,
  SwitchRow,
  TextField,
  Txt,
} from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

const FUELS: FuelType[] = ['GASOLINE', 'DIESEL', 'HYBRID', 'ELECTRIC'];
const MAX_PHOTOS = 6;

interface FormState {
  make: string;
  model: string;
  year: string;
  seats: string;
  transmission: Transmission;
  fuelType: FuelType;
  color: string;
  placeId: number | null;
  description: string;
  selfDrive: boolean;
  pricePerDayUsd: string;
  withDriver: boolean;
  withDriverPricePerDayUsd: string;
  depositUsd: string;
  minDays: string;
}

function toForm(l?: Listing): FormState {
  return {
    make: l?.make ?? '',
    model: l?.model ?? '',
    year: l ? String(l.year) : '',
    seats: l ? String(l.seats) : '5',
    transmission: l?.transmission ?? 'AUTOMATIC',
    fuelType: l?.fuelType ?? 'GASOLINE',
    color: l?.color ?? '',
    placeId: l?.place.id ?? null,
    description: l?.description ?? '',
    selfDrive: l?.selfDrive ?? true,
    pricePerDayUsd: l?.pricePerDayUsd != null ? String(l.pricePerDayUsd) : '',
    withDriver: l?.withDriver ?? false,
    withDriverPricePerDayUsd: l?.withDriverPricePerDayUsd != null ? String(l.withDriverPricePerDayUsd) : '',
    depositUsd: l ? String(l.depositUsd) : '0',
    minDays: l ? String(l.minDays) : '1',
  };
}

const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));

export default function ListingEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const listingId = isNew ? null : Number(id);
  const listings = useQuery({
    queryKey: qk.ownerListings,
    queryFn: async () => (await ownerApi.listings()).listings,
    enabled: !isNew,
  });
  const listing = listings.data?.find((l) => l.id === listingId);

  if (!isNew && listings.isLoading) return <LoadingView />;
  if (!isNew && (listings.isError || !listing))
    return <ErrorView error={listings.error} onRetry={() => void listings.refetch()} />;
  return <ListingForm key={listing?.id ?? 'new'} listing={listing} />;
}

function ListingForm({ listing }: { listing?: Listing }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const places = usePlaces();
  const [form, setForm] = useState<FormState>(() => toForm(listing));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [toggling, setToggling] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const place =
    places.data?.find((p) => p.id === form.placeId) ??
    (listing && listing.place.id === form.placeId ? listing.place : null);

  const refresh = (l: Listing) => {
    qc.setQueryData<Listing[]>(qk.ownerListings, (old) => (old ? old.map((x) => (x.id === l.id ? l : x)) : old));
    void qc.invalidateQueries({ queryKey: qk.ownerListings });
  };

  const validate = (): ListingInput | null => {
    const e: typeof errors = {};
    const year = num(form.year);
    const seats = num(form.seats);
    const deposit = num(form.depositUsd);
    const minDays = num(form.minDays);
    const price = num(form.pricePerDayUsd);
    const priceDriver = num(form.withDriverPricePerDayUsd);
    const maxYear = new Date().getFullYear() + 1;
    if (!form.make.trim()) e.make = t('common.required');
    if (!form.model.trim()) e.model = t('common.required');
    if (!form.color.trim()) e.color = t('common.required');
    if (!Number.isInteger(year) || year < 1970 || year > maxYear) e.year = t('listingForm.invalidYear');
    if (!Number.isInteger(seats) || seats < 1 || seats > 60) e.seats = t('listingForm.invalidNumber');
    if (!(deposit >= 0)) e.depositUsd = t('listingForm.invalidNumber');
    if (!Number.isInteger(minDays) || minDays < 1) e.minDays = t('listingForm.invalidNumber');
    if (!form.placeId) e.placeId = t('common.required');
    if (form.selfDrive && !(price > 0)) e.pricePerDayUsd = t('listingForm.invalidPrice');
    if (form.withDriver && !(priceDriver > 0)) e.withDriverPricePerDayUsd = t('listingForm.invalidPrice');
    setErrors(e);
    if (!form.selfDrive && !form.withDriver) {
      setError(t('listingForm.chooseMode'));
      return null;
    }
    if (Object.keys(e).length) {
      setError(t('listingForm.fixErrors'));
      return null;
    }
    setError(null);
    return {
      make: form.make.trim(),
      model: form.model.trim(),
      year,
      seats,
      transmission: form.transmission,
      fuelType: form.fuelType,
      color: form.color.trim(),
      placeId: form.placeId!,
      description: form.description.trim() || null,
      selfDrive: form.selfDrive,
      pricePerDayUsd: form.selfDrive ? price : null,
      withDriver: form.withDriver,
      withDriverPricePerDayUsd: form.withDriver ? priceDriver : null,
      depositUsd: deposit,
      minDays,
    };
  };

  const save = async () => {
    const body = validate();
    if (!body) return;
    setSaving(true);
    try {
      if (listing) {
        const { listing: l } = await ownerApi.updateListing(listing.id, body);
        refresh(l);
        Alert.alert(t('listingForm.savedTitle'), t('listingForm.saved'));
      } else {
        const { listing: l } = await ownerApi.createListing(body);
        await qc.invalidateQueries({ queryKey: qk.ownerListings });
        Alert.alert(t('listingForm.createdTitle'), t('listingForm.created'));
        router.replace(`/listing-edit/${l.id}`);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const addPhotos = async () => {
    if (!listing) return;
    const remaining = MAX_PHOTOS - listing.photos.length;
    if (remaining <= 0) {
      Alert.alert(t('listingForm.photos'), t('listingForm.maxPhotos', { count: MAX_PHOTOS }));
      return;
    }
    try {
      const files = await pickImages({ multiple: true, limit: remaining });
      if (!files.length) return;
      setPhotoBusy(true);
      const { listing: l } = await ownerApi.uploadPhotos(listing.id, files.slice(0, remaining));
      refresh(l);
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof FileTooLargeError ? t('documents.tooLarge') : errorMessage(e));
    } finally {
      setPhotoBusy(false);
    }
  };

  const deletePhoto = (photoId: number) => {
    if (!listing) return;
    Alert.alert(t('listingForm.deletePhoto'), t('listingForm.deletePhotoConfirm'), [
      { text: t('common.no'), style: 'cancel' },
      {
        text: t('common.yes'),
        style: 'destructive',
        onPress: async () => {
          try {
            const { listing: l } = await ownerApi.deletePhoto(listing.id, photoId);
            refresh(l);
          } catch (e) {
            Alert.alert(t('common.error'), errorMessage(e));
          }
        },
      },
    ]);
  };

  const toggleActive = async () => {
    if (!listing) return;
    setToggling(true);
    try {
      const { listing: l } = await ownerApi.updateListing(listing.id, { isActive: !listing.isActive });
      refresh(l);
    } catch (e) {
      Alert.alert(t('common.error'), errorMessage(e));
    } finally {
      setToggling(false);
    }
  };

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: listing ? `${listing.make} ${listing.model}` : t('owner.addCar') }} />

      {listing ? (
        <>
          <Row style={{ justifyContent: 'space-between', marginBottom: spacing.sm }}>
            <StatusBadge status={listing.status} />
            <Button
              title={listing.isActive ? t('owner.deactivate') : t('owner.activate')}
              small
              variant={listing.isActive ? 'secondary' : 'primary'}
              loading={toggling}
              onPress={toggleActive}
            />
          </Row>
          {listing.status === 'PENDING' ? (
            <Banner tone="warning" icon="hourglass" message={t('owner.pendingReview')} />
          ) : null}
          {listing.status === 'REJECTED' ? (
            <Banner
              tone="danger"
              icon="close-circle"
              title={t('status.REJECTED')}
              message={listing.rejectionReason ?? undefined}
            />
          ) : null}

          <SectionTitle>{t('listingForm.photos')}</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {listing.photos.map((p) => (
              <View key={p.id}>
                <Image source={{ uri: fileUrl(p.url) }} style={styles.photo} />
                <Pressable style={styles.deletePhoto} onPress={() => deletePhoto(p.id)} hitSlop={6}>
                  <Ionicons name="close" size={16} color={colors.white} />
                </Pressable>
              </View>
            ))}
            {listing.photos.length < MAX_PHOTOS ? (
              <Pressable style={[styles.photo, styles.addPhoto]} onPress={addPhotos} disabled={photoBusy}>
                <Ionicons name={photoBusy ? 'hourglass' : 'camera'} size={28} color={colors.textMuted} />
                <Txt variant="small">{photoBusy ? t('common.loading') : t('listingForm.addPhotos')}</Txt>
              </Pressable>
            ) : null}
          </ScrollView>
        </>
      ) : (
        <Banner tone="info" icon="information-circle" message={t('listingForm.photosAfterCreate')} />
      )}

      <SectionTitle>{t('listingForm.car')}</SectionTitle>
      <Row gap={spacing.md}>
        <View style={{ flex: 1 }}>
          <TextField
            label={t('driverApply.make')}
            value={form.make}
            onChangeText={(v) => set('make', v)}
            error={errors.make}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label={t('driverApply.model')}
            value={form.model}
            onChangeText={(v) => set('model', v)}
            error={errors.model}
          />
        </View>
      </Row>
      <Row gap={spacing.md}>
        <View style={{ flex: 1 }}>
          <TextField
            label={t('listingForm.year')}
            value={form.year}
            onChangeText={(v) => set('year', v)}
            keyboardType="number-pad"
            error={errors.year}
            ltr
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label={t('listingForm.seats')}
            value={form.seats}
            onChangeText={(v) => set('seats', v)}
            keyboardType="number-pad"
            error={errors.seats}
            ltr
          />
        </View>
      </Row>
      <TextField
        label={t('driverApply.color')}
        value={form.color}
        onChangeText={(v) => set('color', v)}
        error={errors.color}
      />

      <Txt variant="label">{t('listingForm.transmission')}</Txt>
      <Segmented<Transmission>
        options={[
          { value: 'AUTOMATIC', label: t('transmission.AUTOMATIC') },
          { value: 'MANUAL', label: t('transmission.MANUAL') },
        ]}
        value={form.transmission}
        onChange={(v) => set('transmission', v)}
      />
      <Txt variant="label" style={{ marginTop: spacing.md }}>
        {t('listingForm.fuel')}
      </Txt>
      <Row style={{ flexWrap: 'wrap' }}>
        {FUELS.map((f) => (
          <Chip key={f} label={t(`fuel.${f}`)} selected={form.fuelType === f} onPress={() => set('fuelType', f)} />
        ))}
      </Row>

      <Txt variant="label" style={{ marginTop: spacing.md }}>
        {t('listingForm.place')}
      </Txt>
      <Pressable
        style={[styles.select, !!errors.placeId && { borderColor: colors.danger }]}
        onPress={() => setPlacesOpen(true)}
      >
        <Ionicons name="location" size={18} color={colors.primaryDark} />
        <Txt style={{ flex: 1 }}>{place ? placeName(place) : t('listingForm.choosePlace')}</Txt>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      <TextField
        label={t('listingForm.description')}
        value={form.description}
        onChangeText={(v) => set('description', v)}
        multiline
        maxLength={1000}
        style={{ marginTop: spacing.sm }}
      />

      <SectionTitle>{t('listingForm.pricing')}</SectionTitle>
      <SwitchRow
        label={t('rentalMode.SELF_DRIVE')}
        description={t('listingForm.selfDriveHint')}
        value={form.selfDrive}
        onChange={(v) => set('selfDrive', v)}
      />
      {form.selfDrive ? (
        <TextField
          label={t('listingForm.pricePerDay')}
          value={form.pricePerDayUsd}
          onChangeText={(v) => set('pricePerDayUsd', v)}
          keyboardType="decimal-pad"
          error={errors.pricePerDayUsd}
          ltr
        />
      ) : null}
      <SwitchRow
        label={t('rentalMode.WITH_DRIVER')}
        description={t('listingForm.withDriverHint')}
        value={form.withDriver}
        onChange={(v) => set('withDriver', v)}
      />
      {form.withDriver ? (
        <TextField
          label={t('listingForm.withDriverPricePerDay')}
          value={form.withDriverPricePerDayUsd}
          onChangeText={(v) => set('withDriverPricePerDayUsd', v)}
          keyboardType="decimal-pad"
          error={errors.withDriverPricePerDayUsd}
          ltr
        />
      ) : null}
      <Row gap={spacing.md}>
        <View style={{ flex: 1 }}>
          <TextField
            label={t('listingForm.deposit')}
            value={form.depositUsd}
            onChangeText={(v) => set('depositUsd', v)}
            keyboardType="decimal-pad"
            error={errors.depositUsd}
            ltr
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label={t('rentals.minDays')}
            value={form.minDays}
            onChangeText={(v) => set('minDays', v)}
            keyboardType="number-pad"
            error={errors.minDays}
            ltr
          />
        </View>
      </Row>

      {error ? <Banner tone="danger" icon="alert-circle" message={error} /> : null}
      <Button title={listing ? t('common.save') : t('listingForm.submit')} onPress={save} loading={saving} />
      {listing ? (
        <Txt variant="small" style={{ marginTop: spacing.sm }}>
          {t('listingForm.reviewNotice')}
        </Txt>
      ) : null}

      <PlacePickerModal
        visible={placesOpen}
        title={t('listingForm.place')}
        onClose={() => setPlacesOpen(false)}
        onSelect={(p) => {
          set('placeId', p.id);
          setPlacesOpen(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { width: 110, height: 110, borderRadius: radius.md, backgroundColor: colors.surface },
  addPhoto: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    gap: 4,
  },
  deletePhoto: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.pill,
    padding: 3,
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
