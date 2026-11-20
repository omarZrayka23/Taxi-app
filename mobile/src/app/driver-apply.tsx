import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { driverApi } from '@/api/endpoints';
import { useAppConfig, useDocuments } from '@/api/queries';
import type { BillingPlan, DriverApplyInput } from '@/api/types';
import { useAuth } from '@/store/auth';
import { errorMessage, formatUsd } from '@/lib/format';
import { VehicleIconView, vehicleName } from '@/lib/vehicles';
import { DRIVER_DOC_TYPES, DocumentsChecklist, missingDocTypes } from '@/components/DocumentsChecklist';
import {
  Banner,
  Button,
  Card,
  KeyValue,
  Screen,
  SectionTitle,
  Segmented,
  StatusBadge,
  SwitchRow,
  TextField,
  Txt,
} from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

export default function DriverApply() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const dp = user?.driverProfile ?? null;
  const showForm = !dp || dp.status === 'REJECTED';
  const docs = useDocuments();
  const missing = missingDocTypes(DRIVER_DOC_TYPES, docs.data);

  return (
    <Screen scroll>
      {dp ? <StatusSection /> : <Txt variant="muted">{t('driverApply.intro')}</Txt>}
      {showForm ? <ApplyForm /> : null}
      {dp ? (
        <>
          <SectionTitle>{t('documents.title')}</SectionTitle>
          {missing.length && !docs.isLoading ? (
            <Banner
              tone="warning"
              icon="alert-circle"
              message={t('documents.missingCount', { count: missing.length })}
            />
          ) : null}
          <DocumentsChecklist types={DRIVER_DOC_TYPES} />
        </>
      ) : null}
    </Screen>
  );
}

function StatusSection() {
  const { t, i18n } = useTranslation();
  const dp = useAuth((s) => s.user?.driverProfile)!;
  const { data: config } = useAppConfig();
  const [plan, setPlan] = useState<BillingPlan>(dp.billingPlan);
  const [saving, setSaving] = useState(false);

  const savePlan = async () => {
    setSaving(true);
    try {
      const { driverProfile } = await driverApi.updateProfile({ billingPlan: plan });
      useAuth.getState().setDriverProfile(driverProfile);
    } catch (e) {
      Alert.alert(t('common.error'), errorMessage(e));
      setPlan(dp.billingPlan);
    } finally {
      setSaving(false);
    }
  };

  const tone = dp.status === 'APPROVED' ? 'success' : dp.status === 'PENDING' ? 'warning' : 'danger';
  const fee = config?.vehicleTypes.find((v) => v.type === dp.vehicleType)?.monthlyFeeUsd;

  return (
    <>
      <Banner
        tone={tone}
        icon={dp.status === 'APPROVED' ? 'checkmark-circle' : dp.status === 'PENDING' ? 'hourglass' : 'alert-circle'}
        title={t(`driverApply.status.${dp.status}`)}
        message={
          dp.status === 'REJECTED' || dp.status === 'SUSPENDED'
            ? (dp.rejectionReason ?? undefined)
            : t(`driverApply.statusHint.${dp.status}`)
        }
      />
      <Card>
        <KeyValue label={t('driverApply.status.label')} value={<StatusBadge status={dp.status} />} />
        <KeyValue label={t('driverApply.vehicleType')} value={vehicleName(dp.vehicle, i18n.language)} />
        <KeyValue
          label={t('driverApply.vehicle')}
          value={`${dp.vehicleMake} ${dp.vehicleModel} · ${dp.vehicleColor}`}
        />
        <KeyValue label={t('driverApply.plate')} value={dp.plateNumber} />
        <KeyValue label={t('driverApply.billingPlan')} value={t(`billingPlan.${dp.billingPlan}`)} />
      </Card>
      {dp.status === 'APPROVED' ? (
        <>
          <Button
            title={t('driverApply.switchToDriver')}
            icon="speedometer"
            onPress={async () => {
              await useAuth.getState().setMode('driver');
              router.replace('/');
            }}
          />
          <SectionTitle>{t('driverApply.billingPlan')}</SectionTitle>
          <Segmented
            options={[
              { value: 'COMMISSION', label: t('billingPlan.COMMISSION') },
              { value: 'MONTHLY', label: t('billingPlan.MONTHLY') },
            ]}
            value={plan}
            onChange={setPlan}
          />
          <Txt variant="small" style={{ marginTop: spacing.sm }}>
            {plan === 'COMMISSION'
              ? t('driverApply.commissionDesc', { percent: config?.commissionPercent ?? '—' })
              : t('driverApply.monthlyDesc', { fee: formatUsd(fee) })}
          </Txt>
          {plan !== dp.billingPlan ? (
            <Button
              title={t('common.save')}
              small
              onPress={savePlan}
              loading={saving}
              style={{ marginTop: spacing.sm }}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

function ApplyForm() {
  const { t, i18n } = useTranslation();
  const prev = useAuth((s) => s.user?.driverProfile);
  const { data: config } = useAppConfig();
  const types = config?.vehicleTypes ?? [];
  const [form, setForm] = useState<DriverApplyInput>({
    vehicleType: prev?.vehicleType ?? '',
    vehicleMake: prev?.vehicleMake ?? '',
    vehicleModel: prev?.vehicleModel ?? '',
    vehicleColor: prev?.vehicleColor ?? '',
    plateNumber: prev?.plateNumber ?? '',
    licenseNumber: prev?.licenseNumber ?? '',
    billingPlan: prev?.billingPlan ?? 'COMMISSION',
  });
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof DriverApplyInput, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof DriverApplyInput>(k: K, v: DriverApplyInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  // The previous type may have been turned off since: fall back to the first active one.
  const selected = types.find((v) => v.type === form.vehicleType) ?? types[0];
  const fee = selected?.monthlyFeeUsd;

  const submit = async () => {
    const errs: typeof errors = {};
    (['vehicleMake', 'vehicleModel', 'vehicleColor', 'plateNumber', 'licenseNumber'] as const).forEach((k) => {
      if (!form[k].trim()) errs[k] = t('common.required');
    });
    setErrors(errs);
    if (Object.keys(errs).length || !agree || !selected) return;
    setLoading(true);
    setError(null);
    try {
      const body = Object.fromEntries(
        Object.entries({ ...form, vehicleType: selected.type }).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]),
      ) as unknown as DriverApplyInput;
      const { driverProfile } = await driverApi.apply(body);
      useAuth.getState().setDriverProfile(driverProfile);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <SectionTitle>{t('driverApply.vehicleType')}</SectionTitle>
      {types.map((v) => {
        const active = v.type === selected?.type;
        return (
          <Pressable
            key={v.type}
            onPress={() => set('vehicleType', v.type)}
            style={[
              {
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
              active && { borderColor: colors.primaryDark, backgroundColor: colors.primaryLight },
            ]}
          >
            <VehicleIconView icon={v.icon} size={26} color={colors.text} />
            <View style={{ flex: 1 }}>
              <Txt variant="subtitle">{vehicleName(v, i18n.language)}</Txt>
              <Txt variant="small">{t('ride.upTo', { count: v.capacity })}</Txt>
            </View>
          </Pressable>
        );
      })}
      <SectionTitle>{t('driverApply.vehicle')}</SectionTitle>
      <TextField
        label={t('driverApply.make')}
        value={form.vehicleMake}
        onChangeText={(v) => set('vehicleMake', v)}
        error={errors.vehicleMake}
      />
      <TextField
        label={t('driverApply.model')}
        value={form.vehicleModel}
        onChangeText={(v) => set('vehicleModel', v)}
        error={errors.vehicleModel}
      />
      <TextField
        label={t('driverApply.color')}
        value={form.vehicleColor}
        onChangeText={(v) => set('vehicleColor', v)}
        error={errors.vehicleColor}
      />
      <TextField
        label={t('driverApply.plate')}
        value={form.plateNumber}
        onChangeText={(v) => set('plateNumber', v.toUpperCase())}
        autoCapitalize="characters"
        error={errors.plateNumber}
        ltr
      />
      <TextField
        label={t('driverApply.licenseNumber')}
        value={form.licenseNumber}
        onChangeText={(v) => set('licenseNumber', v)}
        error={errors.licenseNumber}
        ltr
      />

      <SectionTitle>{t('driverApply.billingPlan')}</SectionTitle>
      <Card
        onPress={() => set('billingPlan', 'COMMISSION')}
        style={form.billingPlan === 'COMMISSION' ? { borderColor: '#E0A800', borderWidth: 2 } : undefined}
      >
        <Txt variant="subtitle">{t('billingPlan.COMMISSION')}</Txt>
        <Txt variant="muted">{t('driverApply.commissionDesc', { percent: config?.commissionPercent ?? '—' })}</Txt>
      </Card>
      <Card
        onPress={() => set('billingPlan', 'MONTHLY')}
        style={form.billingPlan === 'MONTHLY' ? { borderColor: '#E0A800', borderWidth: 2 } : undefined}
      >
        <Txt variant="subtitle">{t('billingPlan.MONTHLY')}</Txt>
        <Txt variant="muted">{t('driverApply.monthlyDesc', { fee: formatUsd(fee) })}</Txt>
      </Card>

      <SwitchRow label={t('driverApply.agree')} value={agree} onChange={setAgree} />
      {error ? <Banner tone="danger" icon="alert-circle" message={error} /> : null}
      <Button
        title={t('driverApply.submit')}
        onPress={submit}
        loading={loading}
        disabled={!agree || !selected}
        style={{ marginTop: spacing.md }}
      />
      <Txt variant="small" style={{ marginTop: spacing.sm }}>
        {t('driverApply.afterSubmit')}
      </Txt>
    </View>
  );
}
