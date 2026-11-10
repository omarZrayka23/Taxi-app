import { FlatList, RefreshControl, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { driverApi } from '@/api/endpoints';
import { qk, useAppConfig } from '@/api/queries';
import { formatDate, formatDateTime, formatUsd } from '@/lib/format';
import { callPhone } from '@/lib/links';
import {
  Banner,
  Button,
  Card,
  EmptyView,
  ErrorView,
  KeyValue,
  LoadingView,
  Row,
  SectionTitle,
  Txt,
} from '@/components/ui';
import { colors, spacing } from '@/theme';

export default function Earnings() {
  const { t } = useTranslation();
  const { data: config } = useAppConfig();
  const q = useQuery({ queryKey: qk.driverBilling, queryFn: driverApi.billing });

  if (q.isLoading) return <LoadingView />;
  if (q.isError || !q.data) return <ErrorView error={q.error} onRetry={() => void q.refetch()} />;
  const b = q.data;
  const overLimit = b.balanceUsd > b.maxDebtUsd;
  const sub = b.subscription;
  const subActive = !!sub?.active && new Date(sub.periodEnd).getTime() > Date.now();

  const header = (
    <View>
      <Card style={overLimit ? { borderColor: colors.danger, borderWidth: 2 } : undefined}>
        <Txt variant="muted">{t('billing.balanceOwed')}</Txt>
        <Txt variant="title" style={{ fontSize: 34, color: overLimit ? colors.danger : colors.text }}>
          {formatUsd(Math.max(0, b.balanceUsd))}
        </Txt>
        {b.balanceUsd < 0 ? (
          <Txt variant="small">{t('billing.credit', { amount: formatUsd(-b.balanceUsd) })}</Txt>
        ) : null}
        <Txt variant="small">{t('billing.maxDebt', { amount: formatUsd(b.maxDebtUsd) })}</Txt>
      </Card>
      {overLimit ? <Banner tone="danger" icon="alert-circle" message={t('errors.DEBT_LIMIT_EXCEEDED')} /> : null}

      <Card>
        <KeyValue label={t('driverApply.billingPlan')} value={t(`billingPlan.${b.billingPlan}`)} />
        {b.billingPlan === 'COMMISSION' ? (
          <KeyValue label={t('billing.commissionRate')} value={`${b.commissionPercent}%`} />
        ) : (
          <>
            <KeyValue label={t('billing.monthlyFee')} value={formatUsd(b.monthlyFeeUsd)} />
            <KeyValue
              label={t('billing.subscription')}
              value={
                sub ? `${formatDate(sub.periodStart)} → ${formatDate(sub.periodEnd)}` : t('billing.noSubscription')
              }
            />
          </>
        )}
      </Card>
      {b.billingPlan === 'MONTHLY' && !subActive ? (
        <Banner tone="warning" icon="calendar" message={t('errors.SUBSCRIPTION_REQUIRED')} />
      ) : null}
      <Txt variant="small">{t('billing.howToPay')}</Txt>
      {config?.supportPhone ? (
        <Button
          title={t('profile.callSupport')}
          icon="call"
          variant="secondary"
          small
          onPress={() => callPhone(config.supportPhone)}
          style={{ marginTop: spacing.sm }}
        />
      ) : null}
      <SectionTitle>{t('billing.ledger')}</SectionTitle>
    </View>
  );

  return (
    <FlatList
      data={b.ledger}
      keyExtractor={(e) => String(e.id)}
      contentContainerStyle={{ padding: spacing.lg }}
      style={{ backgroundColor: colors.background }}
      ListHeaderComponent={header}
      ListEmptyComponent={<EmptyView title={t('billing.noEntries')} icon="receipt-outline" />}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
      renderItem={({ item }) => (
        <Row style={{ paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ flex: 1 }}>
            <Txt style={{ fontWeight: '600' }}>{t(`ledger.${item.type}`)}</Txt>
            <Txt variant="small">{item.description}</Txt>
            <Txt variant="small">{formatDateTime(item.createdAt)}</Txt>
          </View>
          <Txt style={{ fontWeight: '800', color: item.amountUsd < 0 ? colors.success : colors.text }}>
            {item.amountUsd < 0 ? `-${formatUsd(-item.amountUsd)}` : `+${formatUsd(item.amountUsd)}`}
          </Txt>
        </Row>
      )}
    />
  );
}
