import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ridesApi } from '@/api/endpoints';
import { qk } from '@/api/queries';
import { isRideActive, type Ride } from '@/api/types';
import { MINIEH } from '@/config';
import { applyRideUpdate } from '@/realtime/socket';
import { errorMessage, formatKm, formatMin, formatUsd } from '@/lib/format';
import { callPhone, openNavigation } from '@/lib/links';
import { Badge, Banner, Button, ErrorView, LoadingView, Price, Row, Stars, StatusBadge, Txt } from '@/components/ui';
import { RouteSummary } from '@/components/ride/RideBits';
import { colors, radius, spacing } from '@/theme';

type Action = 'arrived' | 'start' | 'complete' | 'cancel';

export default function DriverRide() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const rideId = Number(id);
  const mapRef = useRef<MapView>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [stars, setStars] = useState(0);
  const [rating, setRating] = useState(false);

  const q = useQuery({
    queryKey: qk.ride(rideId),
    queryFn: async () => (await ridesApi.get(rideId)).ride,
    enabled: !!rideId,
    refetchInterval: (query) => (query.state.data && isRideActive(query.state.data.status) ? 10_000 : false),
  });
  const ride = q.data;

  useEffect(() => {
    if (!ride) return;
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(
        [
          { latitude: ride.pickupLat, longitude: ride.pickupLng },
          { latitude: ride.dropoffLat, longitude: ride.dropoffLng },
        ],
        { edgePadding: { top: 60, bottom: 60, left: 60, right: 60 }, animated: true },
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [ride?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isLoading) return <LoadingView />;
  if (q.isError || !ride) return <ErrorView error={q.error} onRetry={() => void q.refetch()} />;

  const run = async (action: Action) => {
    setBusy(action);
    try {
      const fn: Record<Action, () => Promise<{ ride: Ride }>> = {
        arrived: () => ridesApi.arrived(ride.id),
        start: () => ridesApi.start(ride.id),
        complete: () => ridesApi.complete(ride.id),
        cancel: () => ridesApi.cancel(ride.id),
      };
      const { ride: updated } = await fn[action]();
      applyRideUpdate(updated);
    } catch (e) {
      Alert.alert(t('common.error'), errorMessage(e));
      void q.refetch();
    } finally {
      setBusy(null);
    }
  };

  const confirm = (title: string, message: string, action: Action, destructive = false) =>
    Alert.alert(title, message, [
      { text: t('common.no'), style: 'cancel' },
      { text: t('common.yes'), style: destructive ? 'destructive' : 'default', onPress: () => void run(action) },
    ]);

  const ratePassenger = async () => {
    if (!stars) return;
    setRating(true);
    try {
      const { ride: updated } = await ridesApi.rate(ride.id, stars);
      applyRideUpdate(updated);
      router.replace('/dashboard');
    } catch (e) {
      Alert.alert(t('common.error'), errorMessage(e));
    } finally {
      setRating(false);
    }
  };

  const toPickup = ride.status === 'ACCEPTED' || ride.status === 'ARRIVED';
  const navTarget = toPickup
    ? { lat: ride.pickupLat, lng: ride.pickupLng }
    : { lat: ride.dropoffLat, lng: ride.dropoffLng };

  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flex: 1 }}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude: ride.pickupLat || MINIEH.latitude,
            longitude: ride.pickupLng || MINIEH.longitude,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
          }}
          showsUserLocation
          toolbarEnabled={false}
        >
          <Marker
            coordinate={{ latitude: ride.pickupLat, longitude: ride.pickupLng }}
            pinColor="green"
            title={t('ride.pickup')}
          />
          <Marker coordinate={{ latitude: ride.dropoffLat, longitude: ride.dropoffLng }} title={t('ride.dropoff')} />
        </MapView>
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={{ padding: spacing.lg }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="subtitle">{t(`driverRide.headline.${ride.status}`)}</Txt>
          <StatusBadge status={ride.status} />
        </Row>

        <Row style={{ justifyContent: 'space-between', marginVertical: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Txt style={{ fontWeight: '700' }}>{ride.passenger.name}</Txt>
            <Txt variant="small">
              {formatKm(ride.distanceKm)} · {formatMin(ride.durationMin)}
            </Txt>
            {ride.pricingMode === 'FIXED_ROUTE' ? <Badge label={t('ride.fixedPrice')} tone="success" /> : null}
          </View>
          <Price usd={ride.fareUsd} lbp={ride.fareLbp} />
        </Row>
        <RouteSummary from={ride.pickupAddress} to={ride.dropoffAddress} />
        {ride.note ? <Banner tone="info" icon="chatbubble-ellipses" message={ride.note} /> : null}

        {isRideActive(ride.status) ? (
          <Row style={{ marginTop: spacing.md }}>
            <Button
              title={t('ride.call')}
              icon="call"
              variant="secondary"
              small
              style={{ flex: 1 }}
              onPress={() => callPhone(ride.passenger.phone)}
            />
            <Button
              title={t('driverRide.navigate')}
              icon="navigate"
              variant="secondary"
              small
              style={{ flex: 1 }}
              onPress={() => openNavigation(navTarget.lat, navTarget.lng)}
            />
          </Row>
        ) : null}

        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          {ride.status === 'ACCEPTED' ? (
            <Button
              title={t('driverRide.arrived')}
              icon="flag"
              loading={busy === 'arrived'}
              onPress={() => void run('arrived')}
            />
          ) : null}
          {ride.status === 'ARRIVED' ? (
            <Button
              title={t('driverRide.start')}
              icon="play"
              loading={busy === 'start'}
              onPress={() => void run('start')}
            />
          ) : null}
          {ride.status === 'IN_PROGRESS' ? (
            <Button
              title={t('driverRide.complete', { amount: formatUsd(ride.fareUsd) })}
              icon="cash"
              variant="success"
              loading={busy === 'complete'}
              onPress={() =>
                confirm(
                  t('driverRide.completeTitle'),
                  t('driverRide.completeConfirm', { amount: formatUsd(ride.fareUsd) }),
                  'complete',
                )
              }
            />
          ) : null}
          {ride.status === 'ACCEPTED' || ride.status === 'ARRIVED' ? (
            <Button
              title={t('ride.cancelRide')}
              variant="danger"
              loading={busy === 'cancel'}
              onPress={() => confirm(t('ride.cancelTitle'), t('driverRide.cancelConfirm'), 'cancel', true)}
            />
          ) : null}
        </View>

        {ride.status === 'COMPLETED' ? (
          <View style={{ marginTop: spacing.md }}>
            <Banner tone="success" icon="cash" title={t('driverRide.collected', { amount: formatUsd(ride.fareUsd) })} />
            {ride.ratingByDriver ? (
              <Button title={t('common.done')} onPress={() => router.replace('/dashboard')} />
            ) : (
              <>
                <Txt style={{ textAlign: 'center', marginBottom: spacing.md }}>
                  {t('driverRide.ratePassenger', { name: ride.passenger.name })}
                </Txt>
                <Stars value={stars} onChange={setStars} size={36} />
                <Button
                  title={t('ride.submitRating')}
                  onPress={ratePassenger}
                  loading={rating}
                  disabled={!stars}
                  style={{ marginTop: spacing.lg }}
                />
                <Button title={t('common.skip')} variant="ghost" onPress={() => router.replace('/dashboard')} />
              </>
            )}
          </View>
        ) : null}

        {ride.status === 'CANCELLED' || ride.status === 'EXPIRED' ? (
          <View style={{ marginTop: spacing.md }}>
            <Banner
              tone="danger"
              icon="close-circle"
              title={t('driverRide.cancelled', { by: t(`cancelledBy.${ride.cancelledBy ?? 'SYSTEM'}`) })}
              message={ride.cancelReason ?? undefined}
            />
            <Button title={t('common.back')} onPress={() => router.replace('/dashboard')} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    maxHeight: '60%',
    marginTop: -16,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg + 6,
    borderTopRightRadius: radius.lg + 6,
  },
});
