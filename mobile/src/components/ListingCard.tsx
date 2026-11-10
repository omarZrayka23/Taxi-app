import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { Listing } from '@/api/types';
import { fileUrl } from '@/config';
import { formatUsd, placeName } from '@/lib/format';
import { Card, Row, Txt } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

export function ListingCard({
  listing,
  onPress,
  badge,
}: {
  listing: Listing;
  onPress: () => void;
  badge?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const photo = fileUrl(listing.photos[0]?.url);
  return (
    <Card onPress={onPress} style={{ padding: 0, overflow: 'hidden' }}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
      ) : (
        <View style={[styles.photo, styles.photoEmpty]}>
          <Ionicons name="car-sport" size={48} color={colors.textMuted} />
        </View>
      )}
      <View style={{ padding: spacing.lg }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="subtitle" style={{ flex: 1 }}>
            {listing.make} {listing.model} {listing.year}
          </Txt>
          {badge}
        </Row>
        <Txt variant="small">
          {placeName(listing.place)} · {t('rentals.seats', { count: listing.seats })} ·{' '}
          {t(`transmission.${listing.transmission}`)}
        </Txt>
        <Row style={{ marginTop: spacing.sm, flexWrap: 'wrap' }} gap={spacing.lg}>
          {listing.selfDrive && listing.pricePerDayUsd != null ? (
            <View>
              <Txt variant="small">{t('rentalMode.SELF_DRIVE')}</Txt>
              <Txt style={{ fontWeight: '800' }}>
                {formatUsd(listing.pricePerDayUsd)} <Txt variant="small">/{t('rentals.day')}</Txt>
              </Txt>
            </View>
          ) : null}
          {listing.withDriver && listing.withDriverPricePerDayUsd != null ? (
            <View>
              <Txt variant="small">{t('rentalMode.WITH_DRIVER')}</Txt>
              <Txt style={{ fontWeight: '800' }}>
                {formatUsd(listing.withDriverPricePerDayUsd)} <Txt variant="small">/{t('rentals.day')}</Txt>
              </Txt>
            </View>
          ) : null}
        </Row>
        <Txt variant="small" style={{ marginTop: spacing.xs }}>
          {listing.owner.businessName || listing.owner.name}
        </Txt>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  photo: {
    width: '100%',
    height: 170,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
});
