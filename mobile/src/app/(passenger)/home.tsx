import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, I18nManager, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { ApiError } from '@/api/client';
import { ridesApi } from '@/api/endpoints';
import { queryClient, qk } from '@/api/queries';
import { isRideActive, type Gender, type LatLng, type Place, type Ride, type VehicleType } from '@/api/types';
import { MINIEH } from '@/config';
import { applyRideUpdate } from '@/realtime/socket';
import { useAuth } from '@/store/auth';
import { useRideStore } from '@/store/rides';
import { coordLabel, errorMessage, formatUsd, placeName } from '@/lib/format';
import { getCurrentPosition, reverseGeocode } from '@/lib/location';
import { Banner, Button, Chip, IconButton, Price, Row, Stars, TextField, Txt } from '@/components/ui';
import { PlacePickerModal } from '@/components/ride/PlacePickerModal';
import { DriverCard, EstimateCard, RouteSummary, vehicleIcon } from '@/components/ride/RideBits';
import { colors, radius, spacing } from '@/theme';

/** `approx` = address is only a coordinate label (reverse geocoding failed). */
type Point = LatLng & { address: string; approx?: boolean };
type Step = 'pickup' | 'dropoff' | 'dropoffPin' | 'confirm';

const DELTA = { latitudeDelta: 0.02, longitudeDelta: 0.02 };

export default function PassengerHome() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const center = useRef<LatLng>({ lat: MINIEH.latitude, lng: MINIEH.longitude });
  const [myLocation, setMyLocation] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(true);

  const ride = useRideStore((s) => s.passengerRide);
  const driverLocation = useRideStore((s) => s.driverLocation);

  const [step, setStep] = useState<Step>('pickup');
  const [pickup, setPickup] = useState<Point | null>(null);
  const [dropoff, setDropoff] = useState<Point | null>(null);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [vehicle, setVehicle] = useState<VehicleType>('TAXI');
  const myGender: Gender = useAuth((s) => s.user?.gender) ?? 'MALE';
  const [driverGender, setDriverGender] = useState<Gender>(myGender);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------- location ----------
  const locate = useCallback(async (animate = true) => {
    setLocating(true);
    const pos = await getCurrentPosition();
    setLocating(false);
    if (pos) {
      setMyLocation(pos);
      center.current = pos;
      if (animate) mapRef.current?.animateToRegion({ latitude: pos.lat, longitude: pos.lng, ...DELTA }, 500);
    }
    return pos;
  }, []);

  useEffect(() => {
    void locate(true);
  }, [locate]);

  // ---------- restore active ride when screen gains focus ----------
  useFocusEffect(
    useCallback(() => {
      if (useRideStore.getState().passengerRide) return;
      ridesApi
        .current()
        .then(({ ride: r }) => {
          queryClient.setQueryData(qk.currentRide, r);
          if (r) useRideStore.getState().setPassengerRide(r);
        })
        .catch(() => undefined);
    }, []),
  );

  // ---------- fallback polling while a ride is active (socket is primary) ----------
  const active = !!ride && isRideActive(ride.status);
  const rideQuery = useQuery({
    queryKey: qk.ride(ride?.id ?? 0),
    queryFn: async () => (await ridesApi.get(ride!.id)).ride,
    enabled: active,
    refetchInterval: active ? 10_000 : false,
  });
  useEffect(() => {
    if (rideQuery.data && ride && rideQuery.data.id === ride.id && rideQuery.data.status !== ride.status) {
      applyRideUpdate(rideQuery.data);
    }
  }, [rideQuery.data, ride]);

  // ---------- estimates ----------
  const estimates = useQuery({
    queryKey: ['rides', 'estimate', pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng],
    queryFn: () => ridesApi.estimate(pickup!, dropoff!),
    enabled: step === 'confirm' && !!pickup && !!dropoff && !ride,
    staleTime: 60_000,
  });
  const estimateList = estimates.data?.estimates;
  // The Man/Woman row only exists once at least one woman driver is registered.
  const showGenderRow = estimates.data?.hasWomenDrivers ?? false;
  const womanAvailable = estimateList?.find((e) => e.vehicleType === vehicle)?.womanDriverNearby ?? false;
  useEffect(() => {
    const list = estimateList;
    if (list?.length && !list.some((e) => e.vehicleType === vehicle)) setVehicle(list[0].vehicleType);
  }, [estimateList, vehicle]);
  // Default to the passenger's own gender, falling back to Man when no woman driver is nearby.
  useEffect(() => {
    if (!estimateList) return;
    setDriverGender(myGender === 'FEMALE' && womanAvailable ? 'FEMALE' : 'MALE');
  }, [estimateList, vehicle, myGender, womanAvailable]);

  // ---------- map fitting ----------
  const fit = useCallback((points: LatLng[]) => {
    const coords = points.map((p) => ({ latitude: p.lat, longitude: p.lng }));
    if (coords.length >= 2) {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 90, bottom: 60, left: 60, right: 60 },
        animated: true,
      });
    } else if (coords.length === 1) {
      mapRef.current?.animateToRegion({ ...coords[0], ...DELTA }, 400);
    }
  }, []);

  useEffect(() => {
    if (ride) {
      fit([
        { lat: ride.pickupLat, lng: ride.pickupLng },
        { lat: ride.dropoffLat, lng: ride.dropoffLng },
      ]);
    } else if (step === 'confirm' && pickup && dropoff) {
      fit([pickup, dropoff]);
    }
  }, [ride?.id, step, pickup, dropoff, fit]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRegionChangeComplete = (r: Region) => {
    center.current = { lat: r.latitude, lng: r.longitude };
  };

  // ---------- step actions ----------
  const confirmPickup = async () => {
    setBusy(true);
    const p = { ...center.current };
    const geo = await reverseGeocode(p);
    setBusy(false);
    setPickup({ ...p, address: geo ?? t('ride.pinnedLocation', { coords: coordLabel(p.lat, p.lng) }), approx: !geo });
    setStep('dropoff');
  };

  const choosePlace = (place: Place) => {
    setPlacesOpen(false);
    setDropoff({ lat: place.lat, lng: place.lng, address: placeName(place) });
    setStep('confirm');
  };

  const confirmDropoffPin = async () => {
    setBusy(true);
    const p = { ...center.current };
    const geo = await reverseGeocode(p);
    setBusy(false);
    setDropoff({ ...p, address: geo ?? t('ride.pinnedLocation', { coords: coordLabel(p.lat, p.lng) }), approx: !geo });
    setStep('confirm');
  };

  const resetFlow = () => {
    setStep('pickup');
    setDropoff(null);
    setNote('');
    setError(null);
    if (pickup) mapRef.current?.animateToRegion({ latitude: pickup.lat, longitude: pickup.lng, ...DELTA }, 400);
  };

  const requestRide = async (input?: {
    vehicleType: VehicleType;
    pickup: Point;
    dropoff: Point;
    note?: string;
    driverGender?: Gender;
  }) => {
    const body =
      input ??
      (pickup && dropoff
        ? {
            vehicleType: vehicle,
            pickup,
            dropoff,
            note: note.trim() || undefined,
            driverGender: showGenderRow ? driverGender : undefined,
          }
        : null);
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      // Prefer the matched place names when the estimate found them.
      const est = estimateList?.find((e) => e.vehicleType === body.vehicleType);
      const pickupAddress = body.pickup.approx && est?.fromPlace ? placeName(est.fromPlace) : body.pickup.address;
      const dropoffAddress = body.dropoff.approx && est?.toPlace ? placeName(est.toPlace) : body.dropoff.address;
      const { ride: r } = await ridesApi.request({
        vehicleType: body.vehicleType,
        driverGender: body.driverGender,
        note: body.note,
        pickup: { lat: body.pickup.lat, lng: body.pickup.lng, address: pickupAddress },
        dropoff: { lat: body.dropoff.lat, lng: body.dropoff.lng, address: dropoffAddress },
      });
      useRideStore.getState().setPassengerRide(r);
      queryClient.setQueryData(qk.currentRide, r);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ACTIVE_RIDE_EXISTS') {
        const { ride: r } = await ridesApi.current().catch(() => ({ ride: null }));
        if (r) useRideStore.getState().setPassengerRide(r);
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const cancelRide = () => {
    if (!ride) return;
    Alert.alert(t('ride.cancelTitle'), t('ride.cancelConfirm'), [
      { text: t('common.no'), style: 'cancel' },
      {
        text: t('ride.cancelRide'),
        style: 'destructive',
        onPress: async () => {
          try {
            const { ride: r } = await ridesApi.cancel(ride.id);
            applyRideUpdate(r);
          } catch (e) {
            Alert.alert(t('common.error'), errorMessage(e));
          }
        },
      },
    ]);
  };

  const closeRide = () => {
    useRideStore.getState().setPassengerRide(null);
    resetFlow();
  };

  const retryRide = (r: Ride, gender: Gender | null = r.driverGender) => {
    useRideStore.getState().setPassengerRide(null);
    void requestRide({
      vehicleType: r.vehicleType,
      driverGender: gender ?? undefined,
      pickup: { lat: r.pickupLat, lng: r.pickupLng, address: r.pickupAddress },
      dropoff: { lat: r.dropoffLat, lng: r.dropoffLng, address: r.dropoffAddress },
      note: r.note ?? undefined,
    });
  };

  // ---------- markers ----------
  const driverPos = useMemo(() => {
    if (!ride?.driver) return null;
    if (driverLocation && driverLocation.rideId === ride.id)
      return { lat: driverLocation.lat, lng: driverLocation.lng };
    if (ride.driver.lat != null && ride.driver.lng != null) return { lat: ride.driver.lat, lng: ride.driver.lng };
    return null;
  }, [ride, driverLocation]);

  const showCenterPin = !ride && (step === 'pickup' || step === 'dropoffPin');
  const markerPickup = ride ? { lat: ride.pickupLat, lng: ride.pickupLng } : step !== 'pickup' ? pickup : null;
  const markerDropoff = ride ? { lat: ride.dropoffLat, lng: ride.dropoffLng } : step === 'confirm' ? dropoff : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flex: 1 }}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={{ ...MINIEH, ...DELTA }}
          showsUserLocation
          showsMyLocationButton={false}
          onRegionChangeComplete={onRegionChangeComplete}
          toolbarEnabled={false}
        >
          {markerPickup ? (
            <Marker
              coordinate={{ latitude: markerPickup.lat, longitude: markerPickup.lng }}
              pinColor="green"
              title={t('ride.pickup')}
            />
          ) : null}
          {markerDropoff ? (
            <Marker
              coordinate={{ latitude: markerDropoff.lat, longitude: markerDropoff.lng }}
              title={t('ride.dropoff')}
            />
          ) : null}
          {driverPos && ride ? (
            <Marker
              coordinate={{ latitude: driverPos.lat, longitude: driverPos.lng }}
              title={ride.driver?.name}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.driverMarker}>
                <Ionicons name={vehicleIcon(ride.vehicleType)} size={18} color={colors.text} />
              </View>
            </Marker>
          ) : null}
        </MapView>

        {showCenterPin ? (
          <View pointerEvents="none" style={styles.centerPinWrap}>
            <Ionicons name="location-sharp" size={44} color={step === 'pickup' ? colors.success : colors.danger} />
          </View>
        ) : null}

        <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
          {!ride && step !== 'pickup' ? (
            <IconButton
              icon={I18nManager.isRTL ? 'arrow-forward' : 'arrow-back'}
              onPress={() => (step === 'confirm' || step === 'dropoffPin' ? setStep('dropoff') : resetFlow())}
              style={styles.roundBtn}
              label={t('common.back')}
            />
          ) : (
            <View />
          )}
          <IconButton
            icon="locate"
            onPress={() => void locate(true)}
            style={styles.roundBtn}
            label={t('ride.myLocation')}
          />
        </View>
      </View>

      <View style={styles.sheet}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg }}>
          {error ? <Banner tone="danger" message={error} icon="alert-circle" /> : null}
          {ride ? (
            <RidePanel
              ride={ride}
              onCancel={cancelRide}
              onClose={closeRide}
              onRetry={() => retryRide(ride)}
              onRetryOther={(g) => retryRide(ride, g)}
              busy={busy}
            />
          ) : step === 'pickup' ? (
            <>
              <Txt variant="subtitle">{t('ride.setPickup')}</Txt>
              <Txt variant="muted" style={{ marginVertical: spacing.sm }}>
                {locating ? t('ride.locating') : myLocation ? t('ride.pickupHint') : t('ride.noLocation')}
              </Txt>
              <Button title={t('ride.confirmPickup')} onPress={confirmPickup} loading={busy} icon="checkmark" />
            </>
          ) : step === 'dropoff' ? (
            <>
              {pickup ? <RouteSummary from={pickup.address} to={t('ride.whereTo')} /> : null}
              <Txt variant="subtitle" style={{ marginTop: spacing.md }}>
                {t('ride.whereTo')}
              </Txt>
              <Button
                title={t('ride.choosePlace')}
                icon="search"
                onPress={() => setPlacesOpen(true)}
                style={{ marginTop: spacing.md }}
              />
              <Button
                title={t('ride.pinOnMap')}
                icon="pin"
                variant="secondary"
                onPress={() => {
                  if (pickup)
                    mapRef.current?.animateToRegion({ latitude: pickup.lat, longitude: pickup.lng, ...DELTA }, 300);
                  setStep('dropoffPin');
                }}
                style={{ marginTop: spacing.sm }}
              />
            </>
          ) : step === 'dropoffPin' ? (
            <>
              <Txt variant="subtitle">{t('ride.moveMapDropoff')}</Txt>
              <Button
                title={t('ride.confirmDropoff')}
                onPress={confirmDropoffPin}
                loading={busy}
                icon="checkmark"
                style={{ marginTop: spacing.md }}
              />
            </>
          ) : (
            <>
              {pickup && dropoff ? <RouteSummary from={pickup.address} to={dropoff.address} /> : null}
              <View style={{ marginTop: spacing.md }}>
                {estimates.isLoading ? (
                  <ActivityIndicator color={colors.primaryDark} style={{ margin: spacing.lg }} />
                ) : estimates.isError ? (
                  <>
                    <Banner tone="danger" message={errorMessage(estimates.error)} />
                    <Button title={t('common.retry')} small onPress={() => void estimates.refetch()} />
                  </>
                ) : (
                  (estimateList ?? []).map((e) => (
                    <EstimateCard
                      key={e.vehicleType}
                      estimate={e}
                      selected={vehicle === e.vehicleType}
                      onPress={() => setVehicle(e.vehicleType)}
                    />
                  ))
                )}
              </View>
              {showGenderRow ? (
                <View style={{ marginBottom: spacing.md }}>
                  <Row gap={spacing.sm}>
                    <Txt style={{ fontWeight: '600' }}>{t('driver.label')}:</Txt>
                    <Chip
                      label={t('gender.MALE')}
                      selected={driverGender === 'MALE'}
                      onPress={() => setDriverGender('MALE')}
                    />
                    <Chip
                      label={t('gender.FEMALE')}
                      selected={driverGender === 'FEMALE'}
                      onPress={() => setDriverGender('FEMALE')}
                      disabled={!womanAvailable}
                    />
                  </Row>
                  {!womanAvailable ? (
                    <Txt variant="small" style={{ marginTop: spacing.xs }}>
                      {t('driver.noWomenNow')}
                    </Txt>
                  ) : null}
                </View>
              ) : null}
              <TextField placeholder={t('ride.notePlaceholder')} value={note} onChangeText={setNote} maxLength={200} />
              <Txt variant="small" style={{ marginBottom: spacing.sm }}>
                {t('ride.cashNotice')}
              </Txt>
              <Button
                title={t('ride.request', { vehicle: t(`vehicle.${vehicle}`) })}
                onPress={() => void requestRide()}
                loading={busy}
                disabled={!estimateList?.length}
              />
            </>
          )}
        </ScrollView>
      </View>

      <PlacePickerModal
        visible={placesOpen}
        title={t('ride.whereTo')}
        onClose={() => setPlacesOpen(false)}
        onSelect={choosePlace}
      />
    </View>
  );
}

function RidePanel({
  ride,
  onCancel,
  onClose,
  onRetry,
  onRetryOther,
  busy,
}: {
  ride: Ride;
  onCancel: () => void;
  onClose: () => void;
  onRetry: () => void;
  onRetryOther: (gender: Gender) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [stars, setStars] = useState(0);
  const [rating, setRating] = useState(false);

  const submitRating = async () => {
    if (!stars) return;
    setRating(true);
    try {
      await ridesApi.rate(ride.id, stars);
      onClose();
    } catch (e) {
      Alert.alert(t('common.error'), errorMessage(e));
    } finally {
      setRating(false);
    }
  };

  const header = (title: string, subtitle?: string) => (
    <View style={{ marginBottom: spacing.sm }}>
      <Txt variant="subtitle">{title}</Txt>
      {subtitle ? <Txt variant="muted">{subtitle}</Txt> : null}
    </View>
  );

  const fareRow = (
    <Row style={{ justifyContent: 'space-between', marginTop: spacing.sm }}>
      <Txt variant="muted">
        {t(`vehicle.${ride.vehicleType}`)} · {t('ride.cash')}
      </Txt>
      <Price usd={ride.fareUsd} lbp={ride.fareLbp} />
    </Row>
  );

  switch (ride.status) {
    case 'REQUESTED':
      return (
        <>
          <Row>
            <ActivityIndicator color={colors.primaryDark} />
            {header(t('ride.searching'), t('ride.searchingHint'))}
          </Row>
          <RouteSummary from={ride.pickupAddress} to={ride.dropoffAddress} />
          {fareRow}
          <Button title={t('ride.cancelRide')} variant="danger" onPress={onCancel} style={{ marginTop: spacing.md }} />
        </>
      );
    case 'ACCEPTED':
    case 'ARRIVED':
    case 'IN_PROGRESS':
      return (
        <>
          {header(t(`ride.status.${ride.status}`), ride.status === 'ARRIVED' ? t('ride.arrivedHint') : undefined)}
          {ride.driver ? <DriverCard driver={ride.driver} /> : null}
          <RouteSummary from={ride.pickupAddress} to={ride.dropoffAddress} />
          {fareRow}
          {ride.status !== 'IN_PROGRESS' ? (
            <Button
              title={t('ride.cancelRide')}
              variant="danger"
              onPress={onCancel}
              style={{ marginTop: spacing.md }}
            />
          ) : null}
        </>
      );
    case 'COMPLETED':
      return (
        <>
          {header(t('ride.completed'), t('ride.payCash', { amount: formatUsd(ride.fareUsd) }))}
          <Price usd={ride.fareUsd} lbp={ride.fareLbp} size="lg" align="center" />
          {ride.ratingByPassenger ? (
            <Button title={t('common.done')} onPress={onClose} style={{ marginTop: spacing.lg }} />
          ) : (
            <>
              <Txt style={{ textAlign: 'center', marginVertical: spacing.md }}>
                {t('ride.rateDriver', { name: ride.driver?.name ?? '' })}
              </Txt>
              <Stars value={stars} onChange={setStars} size={38} />
              <Button
                title={t('ride.submitRating')}
                onPress={submitRating}
                loading={rating}
                disabled={!stars}
                style={{ marginTop: spacing.lg }}
              />
              <Button title={t('common.skip')} variant="ghost" onPress={onClose} />
            </>
          )}
        </>
      );
    case 'EXPIRED':
      return (
        <>
          <Banner tone="warning" icon="sad-outline" title={t('ride.expired')} message={t('ride.expiredHint')} />
          <Button title={t('ride.tryAgain')} onPress={onRetry} loading={busy} />
          {ride.driverGender ? (
            <Button
              title={t(ride.driverGender === 'FEMALE' ? 'ride.tryWithMan' : 'ride.tryWithWoman')}
              variant="secondary"
              onPress={() => onRetryOther(ride.driverGender === 'FEMALE' ? 'MALE' : 'FEMALE')}
              loading={busy}
            />
          ) : null}
          <Button title={t('common.close')} variant="ghost" onPress={onClose} />
        </>
      );
    case 'CANCELLED':
    default:
      return (
        <>
          <Banner
            tone="danger"
            icon="close-circle"
            title={
              ride.cancelledBy === 'PASSENGER'
                ? t('ride.cancelledByYou')
                : t('ride.cancelledByOther', { by: t(`cancelledBy.${ride.cancelledBy ?? 'SYSTEM'}`) })
            }
            message={ride.cancelReason ?? undefined}
          />
          {ride.cancelledBy !== 'PASSENGER' ? (
            <Button title={t('ride.tryAgain')} onPress={onRetry} loading={busy} />
          ) : null}
          <Button title={t('common.close')} variant="ghost" onPress={onClose} />
        </>
      );
  }
}

const styles = StyleSheet.create({
  centerPinWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 44, // put the pin's tip on the map centre
  },
  topBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  roundBtn: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    width: 44,
    height: 44,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  sheet: {
    maxHeight: '58%',
    marginTop: -16,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg + 6,
    borderTopRightRadius: radius.lg + 6,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
  },
  driverMarker: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    padding: 6,
    borderWidth: 2,
    borderColor: colors.white,
  },
});
