import { Button, Group, NumberInput, Paper, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import type { ReactNode } from 'react';
import { adminApi } from '../api/endpoints';
import type { Settings } from '../api/types';
import { PageHeader } from '../components/Layout';
import { QueryState } from '../components/QueryState';
import { formatLbp } from '../lib/format';
import { useApiMutation } from '../lib/notify';
import { keys, useSettings } from '../lib/queries';

export default function SettingsPage() {
  const query = useSettings();
  return (
    <>
      <PageHeader title="Settings" description="Platform-wide business settings." />
      <QueryState query={query}>
        {/* Re-mount when server values change so the form starts from fresh values. */}
        {(settings) => <SettingsForm key={JSON.stringify(settings)} settings={settings} />}
      </QueryState>
    </>
  );
}

type NumericKey = Exclude<keyof Settings, 'supportPhone'>;
type Values = { [K in NumericKey]: number | string } & { supportPhone: string };

const NUMERIC_KEYS: NumericKey[] = [
  'commissionPercent',
  'rentalCommissionPercent',
  'lbpRate',
  'maxDebtUsd',
  'searchRadiusKm',
  'offerTimeoutSec',
  'fareRoundingUsd',
];

const required = (v: number | string) => (v === '' || !Number.isFinite(Number(v)) ? 'Required' : null);
const min = (m: number) => (v: number | string) => required(v) ?? (Number(v) < m ? `Must be ≥ ${m}` : null);
const pct = (v: number | string) => required(v) ?? (Number(v) < 0 || Number(v) > 100 ? '0–100' : null);

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Paper withBorder radius="md" p="lg">
      <Title order={5}>{title}</Title>
      <Text size="sm" c="dimmed" mb="md">
        {description}
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        {children}
      </SimpleGrid>
    </Paper>
  );
}

function SettingsForm({ settings }: { settings: Settings }) {
  const form = useForm<Values>({
    initialValues: { ...settings },
    validate: {
      commissionPercent: pct,
      rentalCommissionPercent: pct,
      lbpRate: min(1),
      maxDebtUsd: min(0),
      searchRadiusKm: min(0.5),
      offerTimeoutSec: min(15),
      fareRoundingUsd: min(0),
      supportPhone: (v) => (v.trim() ? null : 'Required'),
    },
  });

  const save = useApiMutation({
    mutationFn: (body: Partial<Settings>) => adminApi.updateSettings(body),
    success: 'Settings saved',
    invalidate: [keys.settings, ['admin', 'stats']],
  });

  const onSubmit = (v: Values) => {
    // Send only the fields that changed (PUT accepts a partial).
    const body: Partial<Settings> = {};
    for (const k of NUMERIC_KEYS) {
      if (Number(v[k]) !== Number(settings[k])) body[k] = Number(v[k]);
    }
    if (v.supportPhone.trim() !== settings.supportPhone) body.supportPhone = v.supportPhone.trim();
    if (Object.keys(body).length) save.mutate(body);
  };

  const rate = Number(form.values.lbpRate);

  return (
    <form onSubmit={form.onSubmit(onSubmit)}>
      <Stack>
        <Section title="Commissions" description="Charged to the driver/owner balance on completion.">
          <NumberInput
            label="Ride commission"
            description="% of each completed fare (drivers on the Commission plan)"
            suffix=" %"
            min={0}
            max={100}
            decimalScale={2}
            {...form.getInputProps('commissionPercent')}
          />
          <NumberInput
            label="Rental commission"
            description="% of each completed rental total (not for platform cars)"
            suffix=" %"
            min={0}
            max={100}
            decimalScale={2}
            {...form.getInputProps('rentalCommissionPercent')}
          />
        </Section>

        <Section title="Monthly plan" description="Debt limit for drivers. Monthly fees are set per vehicle type under Vehicle types.">
          <NumberInput
            label="Maximum debt"
            description="Drivers owing more than this cannot go online"
            prefix="$"
            min={0}
            decimalScale={2}
            {...form.getInputProps('maxDebtUsd')}
          />
        </Section>

        <Section title="Currency & fares" description="LBP prices are computed from USD with this rate.">
          <NumberInput
            label="LBP rate"
            description={Number.isFinite(rate) && rate > 0 ? `$1 = ${formatLbp(rate)} · $10 = ${formatLbp(rate * 10)}` : 'LBP per 1 USD'}
            min={1}
            thousandSeparator=","
            allowDecimal={false}
            {...form.getInputProps('lbpRate')}
          />
          <NumberInput
            label="Fare rounding"
            description="Calculated fares are rounded up to a multiple of this (e.g. 0.5)"
            prefix="$"
            min={0}
            step={0.25}
            decimalScale={2}
            {...form.getInputProps('fareRoundingUsd')}
          />
        </Section>

        <Section title="Dispatch" description="How new ride requests are offered to drivers.">
          <NumberInput label="Search radius" suffix=" km" min={0.5} decimalScale={2} {...form.getInputProps('searchRadiusKm')} />
          <NumberInput
            label="Offer timeout"
            description="Ride expires if no driver accepts within this time"
            suffix=" s"
            min={15}
            allowDecimal={false}
            {...form.getInputProps('offerTimeoutSec')}
          />
        </Section>

        <Section title="Support" description="Shown in the mobile app.">
          <TextInput label="Support phone" placeholder="+96170123456" {...form.getInputProps('supportPhone')} />
        </Section>

        <Group justify="flex-end">
          <Button variant="default" disabled={!form.isDirty()} onClick={() => form.reset()}>
            Reset
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!form.isDirty()}>
            Save settings
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
