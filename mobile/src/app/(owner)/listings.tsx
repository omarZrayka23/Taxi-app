import { FlatList, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ownerApi } from '@/api/endpoints';
import { qk } from '@/api/queries';
import { ListingCard } from '@/components/ListingCard';
import { Badge, Button, EmptyView, ErrorView, LoadingView, Row, StatusBadge } from '@/components/ui';
import { colors, spacing } from '@/theme';

export default function OwnerListings() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: qk.ownerListings, queryFn: async () => (await ownerApi.listings()).listings });
  useFocusEffect(
    useCallback(() => {
      void q.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  if (q.isLoading) return <LoadingView />;
  if (q.isError) return <ErrorView error={q.error} onRetry={() => void q.refetch()} />;

  return (
    <FlatList
      data={q.data ?? []}
      keyExtractor={(l) => String(l.id)}
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
      ListHeaderComponent={
        <Button
          title={t('owner.addCar')}
          icon="add"
          onPress={() => router.push('/listing-edit/new')}
          style={{ marginBottom: spacing.md }}
        />
      }
      ListEmptyComponent={
        <EmptyView title={t('owner.noListings')} message={t('owner.noListingsHint')} icon="car-sport-outline" />
      }
      renderItem={({ item }) => (
        <ListingCard
          listing={item}
          onPress={() => router.push(`/listing-edit/${item.id}`)}
          badge={
            <Row gap={4}>
              <StatusBadge status={item.status} />
              {!item.isActive ? <Badge label={t('owner.inactive')} /> : null}
            </Row>
          }
        />
      )}
      ListFooterComponent={<View style={{ height: spacing.xl }} />}
    />
  );
}
