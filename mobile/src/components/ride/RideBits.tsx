import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { RideDriver, RideEstimate } from '@/api/types';
import { formatKm, formatMin } from '@/lib/format';
import { callPhone } from '@/lib/links';
import { Badge, Button, Price, Rating, Row, Txt } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';
import { Pressable } from 'react-native';
import { VehicleIconView, vehicleName } from '@/lib/vehicles';

export function EstimateCard({
  estimate,
  selected,
  onPress,
}: {
  estimate: RideEstimate;
  selected: boolean;
  onPress: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.estimate, selected && { borderColor: colors.primaryDark, backgroundColor: colors.primaryLight }]}
    >
      <View style={styles.vehicleIcon}>
        <VehicleIconView icon={estimate.vehicle.icon} size={26} color={colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="subtitle">{vehicleName(estimate.vehicle, i18n.language)}</Txt>
        <Txt variant="small">
          {formatKm(estimate.distanceKm)} · {formatMin(estimate.durationMin)}
        </Txt>
        <Txt variant="small">{t('ride.upTo', { count: estimate.vehicle.capacity })}</Txt>
        {estimate.pricingMode === 'FIXED_ROUTE' ? (
          <View style={{ marginTop: 4 }}>
            <Badge label={t('ride.fixedPrice')} tone="success" />
          </View>
        ) : null}
      </View>
      <Price usd={estimate.fareUsd} lbp={estimate.fareLbp} />
    </Pressable>
  );
}

export function DriverCard({ driver }: { driver: RideDriver }) {
  const { t } = useTranslation();
  return (
    <View style={styles.driver}>
      <View style={styles.avatar}>
        <Ionicons name="person" size={26} color={colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Row gap={6}>
          <Txt variant="subtitle">{driver.name}</Txt>
          <Rating value={driver.ratingAvg} />
        </Row>
        <Txt variant="small">
          {[driver.vehicleMake, driver.vehicleModel, driver.vehicleColor].filter(Boolean).join(' · ')}
        </Txt>
        <View style={styles.plate}>
          <Txt style={{ fontWeight: '800', letterSpacing: 1 }}>{driver.plateNumber}</Txt>
        </View>
      </View>
      <Button title={t('ride.call')} icon="call" small onPress={() => callPhone(driver.phone)} />
    </View>
  );
}

export function RouteSummary({ from, to }: { from: string; to: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Row>
        <Ionicons name="radio-button-on" size={16} color={colors.success} />
        <Txt numberOfLines={1} style={{ flex: 1 }}>
          {from}
        </Txt>
      </Row>
      <Row>
        <Ionicons name="location" size={16} color={colors.danger} />
        <Txt numberOfLines={1} style={{ flex: 1 }}>
          {to}
        </Txt>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  estimate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.white,
  },
  vehicleIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driver: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.md },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plate: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: colors.text,
    borderRadius: 4,
    backgroundColor: colors.white,
  },
});
