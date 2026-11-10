import { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { ApiError } from '@/api/client';
import { driverApi, ridesApi } from '@/api/endpoints';
import { qk } from '@/api/queries';
import type { Ride } from '@/api/types';
import { useAuth } from '@/store/auth';
import { useRideStore, type Offer } from '@/store/rides';
import { applyRideUpdate } from '@/realtime/socket';
import { errorMessage, formatKm, formatMin } from '@/lib/format';
import { getCurrentPosition } from '@/lib/location';
import {
  Badge,
  Banner,
  Button,
  Card,
  Price,
  Rating,
  Row,
  Screen,
  SectionTitle,
  StatusBadge,
  Txt,
} from '@/components/ui';
import { RouteSummary, vehicleIcon } from '@/components/ride/RideBits';
import { colors, radius, spacing } from '@/theme';

export default function DriverDashboard() {
  const { t } = useTranslation();
  const dp = useAuth((s) => s.user?.driverProfile);
  const socketConnected = useRideStore((s) => s.socketConnected);
  const offers = useRideStore((s) => s.offers);
  const [toggling, setToggling] = useState(false);
  const [onlineError, setOnlineError] = useState<ApiError | Error | null>(null);
  const online = !!dp?.isOnline;

  const current = useQuery({
    queryKey: qk.driverCurrentRide,
    queryFn: async () => (await driverApi.currentRide()).ride,
  });

  const offersQuery = useQuery({
    queryKey: qk.driverOffers,
    queryFn: async () => (await driverApi.offers()).rides,
    enabled: online && !current.data,
    refetchInterval: online && !current.data ? 10_000 : false,
  });
  useEffect(() => {
    if (offersQuery.data)
      useRideStore.getState().setOffers(offersQuery.data.map((ride) => ({ ride, expiresAt: null })));
  }, [offersQuery.data]);

  useFocusEffect(
    useCallback(() => {
      void current.refetch();
      void useAuth.getState().refreshUser();
      if (online) void offersQuery.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [online]),
  );

  if (!dp) return null;

  const goOnline = async () => {
    setToggling(true);
    setOnlineError(null);
    try {
      const pos = await getCurrentPosition();
      if (!pos) {
        setOnlineError(new Error(t('driver.locationRequired')));
        return;
      }
      const { driverProfile } = await driverApi.online(pos);
      useAuth.getState().setDriverProfile(driverProfile);
    } catch (e) {
      setOnlineError(e as Error);
    } finally {
      setToggling(false);
    }
  };

  const goOffline = async () => {
    setToggling(true);
    try {
      const { driverProfile } = await driverApi.offline();
      useAuth.getState().setDriverProfile(driverProfile);
      useRideStore.getState().setOffers([]);
    } catch (e) {
      Alert.alert(t('common.error'), errorMessage(e));
    } finally {
      setToggling(false);
    }
  };

  const errCode = onlineError instanceof ApiError ? onlineError.code : null;
  const activeRide = current.data;

  return (
    <Screen
      scroll
      refreshControl={
        <RefreshControl
          refreshing={current.isRefetching}
          onRefresh={() => {
            void current.refetch();
            void useAuth.getState().refreshUser();
            if (online) void offersQuery.refetch();
          }}
        />
      }
    >
      {dp.status === 'SUSPENDED' ? (
        <Banner
          tone="danger"
          icon="ban"
          title={t('driverApply.status.SUSPENDED')}
          message={dp.rejectionReason ?? t('driverApply.statusHint.SUSPENDED')}
        />
      ) : null}

      <Card
        style={[styles.statusCard, online && { backgroundColor: colors.successLight, borderColor: colors.success }]}
      >
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Txt variant="title">{online ? t('driver.online') : t('driver.offline')}</Txt>
            <Txt variant="muted">{online ? t('driver.onlineHint') : t('driver.offlineHint')}</Txt>
          </View>
          <View style={[styles.dot, { backgroundColor: online ? colors.success : colors.textMuted }]} />
        </Row>
        <Row style={{ marginTop: spacing.md }} gap={spacing.md}>
          <Badge label={t(`vehicle.${dp.vehicleType}`)} />
          <Badge label={t(`billingPlan.${dp.billingPlan}`)} tone="info" />
          <Rating value={dp.ratingAvg} />
          {online && !socketConnected ? <Badge label={t('driver.reconnecting')} tone="warning" /> : null}
        </Row>
        <Button
          title={online ? t('driver.goOffline') : t('driver.goOnline')}
          variant={online ? 'danger' : 'dark'}
          icon={online ? 'pause' : 'power'}
          loading={toggling}
          disabled={dp.status !== 'APPROVED' && !online}
          onPress={online ? goOffline : goOnline}
          style={{ marginTop: spacing.lg }}
        />
      </Card>

      {onlineError ? (
        <Banner
          tone="danger"
          icon="alert-circle"
          title={errCode ? t(`driver.cannotGoOnline`) : undefined}
          message={errorMessage(onlineError)}
        />
      ) : null}
      {errCode === 'SUBSCRIPTION_REQUIRED' || errCode === 'DEBT_LIMIT_EXCEEDED' ? (
        <Button title={t('driver.viewBilling')} variant="secondary" small onPress={() => router.push('/earnings')} />
      ) : null}

      {activeRide ? (
        <>
          <SectionTitle>{t('driver.activeRide')}</SectionTitle>
          <Card onPress={() => router.push(`/driver-ride/${activeRide.id}`)}>
            <Row style={{ justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <Txt variant="subtitle">{activeRide.passenger.name}</Txt>
              <StatusBadge status={activeRide.status} />
            </Row>
            <RouteSummary from={activeRide.pickupAddress} to={activeRide.dropoffAddress} />
            <Button
              title={t('driver.openRide')}
              small
              style={{ marginTop: spacing.md }}
              onPress={() => router.push(`/driver-ride/${activeRide.id}`)}
            />
          </Card>
        </>
      ) : online ? (
        <>
          <SectionTitle>{t('driver.offers')}</SectionTitle>
          {offers.length === 0 ? (
            <Card style={{ alignItems: 'center' }}>
              <Ionicons name="radio-outline" size={36} color={colors.textMuted} />
              <Txt variant="muted" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
                {t('driver.waitingOffers')}
              </Txt>
            </Card>
          ) : (
            offers.map((o) => <OfferCard key={o.ride.id} offer={o} />)
          )}
        </>
      ) : null}
    </Screen>
  );
}

function useCountdown(expiresAt: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  if (!expiresAt) return null;
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000));
}

function OfferCard({ offer }: { offer: Offer }) {
  const { t } = useTranslation();
  const ride: Ride = offer.ride;
  const [accepting, setAccepting] = useState(false);
  const secondsLeft = useCountdown(offer.expiresAt);

  useEffect(() => {
    if (secondsLeft === 0) useRideStore.getState().removeOffer(ride.id);
  }, [secondsLeft, ride.id]);

  const accept = async () => {
    setAccepting(true);
    try {
      const { ride: accepted } = await ridesApi.accept(ride.id);
      useRideStore.getState().removeOffer(ride.id);
      applyRideUpdate(accepted);
      router.push(`/driver-ride/${accepted.id}`);
    } catch (e) {
      useRideStore.getState().removeOffer(ride.id);
      if (e instanceof ApiError && e.code === 'RIDE_NOT_AVAILABLE') {
        Alert.alert(t('driver.offerGone'), t('errors.RIDE_NOT_AVAILABLE'));
      } else {
        Alert.alert(t('common.error'), errorMessage(e));
      }
    } finally {
      setAccepting(false);
    }
  };

  return (
    <Card style={styles.offer}>
      <Row style={{ justifyContent: 'space-between', marginBottom: spacing.sm }}>
        <Row>
          <Ionicons name={vehicleIcon(ride.vehicleType)} size={20} color={colors.text} />
          <Txt variant="subtitle">{t('driver.newRequest')}</Txt>
        </Row>
        {secondsLeft != null ? <Badge label={`${secondsLeft}s`} tone="warning" /> : null}
      </Row>
      <RouteSummary from={ride.pickupAddress} to={ride.dropoffAddress} />
      <Row style={{ justifyContent: 'space-between', marginTop: spacing.md }}>
        <View>
          <Txt variant="small">
            {formatKm(ride.distanceKm)} · {formatMin(ride.durationMin)}
          </Txt>
          {ride.pricingMode === 'FIXED_ROUTE' ? <Badge label={t('ride.fixedPrice')} tone="success" /> : null}
          {ride.note ? (
            <Txt variant="small" style={{ marginTop: 4 }}>
              “{ride.note}”
            </Txt>
          ) : null}
        </View>
        <Price usd={ride.fareUsd} lbp={ride.fareLbp} />
      </Row>
      <Button
        title={t('driver.accept')}
        icon="checkmark"
        onPress={accept}
        loading={accepting}
        style={{ marginTop: spacing.md }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  statusCard: { borderWidth: 2 },
  dot: { width: 18, height: 18, borderRadius: radius.pill },
  offer: { borderColor: colors.primaryDark, borderWidth: 2, backgroundColor: colors.primaryLight },
});
