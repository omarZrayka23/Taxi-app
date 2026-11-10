import { Alert, Button, Group, NumberInput, Paper, SegmentedControl, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconInfoCircle } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { adminApi } from '../api/endpoints';
import type { PricingMode, VehiclePricing } from '../api/types';
import { PageHeader } from '../components/Layout';
import { QueryState } from '../components/QueryState';
import { StatusBadge } from '../components/StatusBadge';
import { formatUsd, humanize } from '../lib/format';
import { useApiMutation } from '../lib/notify';
import { keys } from '../lib/queries';

export default function PricingPage() {
  const query = useQuery({
    queryKey: keys.pricing,
    queryFn: async () => (await adminApi.pricing()).vehicleTypes,
  });

  return (
    <>
      <PageHeader title="Pricing" description="How ride fares are computed for each vehicle type." />
      <Alert color="blue" icon={<IconInfoCircle size={18} />} mb="md">
        <Text size="sm">
          <b>Calculated</b>: fare = max(minimum fare, base fare + per km × distance + per minute × duration), rounded up to the
          fare rounding step from Settings.
        </Text>
        <Text size="sm" mt={4}>
          <b>Fixed route</b>: pickup and drop-off are matched to the nearest active <Link to="/places">place</Link>; if a{' '}
          <Link to="/route-fares">route fare</Link> exists for that pair and vehicle type its price is used. When no route price
          exists, the fare <b>falls back to the calculated formula</b> below — so keep these values filled in.
        </Text>
      </Alert>
      <QueryState query={query}>
        {(items) => (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            {items.map((p) => (
              // Re-mount when server values change so the form starts from fresh values.
              <PricingCard key={JSON.stringify(p)} pricing={p} />
            ))}
          </SimpleGrid>
        )}
      </QueryState>
    </>
  );
}

interface Values {
  mode: PricingMode;
  baseFare: number | string;
  perKm: number | string;
  perMin: number | string;
  minimumFare: number | string;
}

const nonNegative = (v: number | string) => (v !== '' && Number(v) >= 0 ? null : 'Zero or more');

function PricingCard({ pricing }: { pricing: VehiclePricing }) {
  const form = useForm<Values>({
    initialValues: {
      mode: pricing.mode,
      baseFare: pricing.baseFare,
      perKm: pricing.perKm,
      perMin: pricing.perMin,
      minimumFare: pricing.minimumFare,
    },
    validate: { baseFare: nonNegative, perKm: nonNegative, perMin: nonNegative, minimumFare: nonNegative },
  });

  const save = useApiMutation({
    mutationFn: (v: Values) =>
      adminApi.updatePricing(pricing.type, {
        mode: v.mode,
        baseFare: Number(v.baseFare),
        perKm: Number(v.perKm),
        perMin: Number(v.perMin),
        minimumFare: Number(v.minimumFare),
      }),
    success: `${humanize(pricing.type)} pricing saved`,
    invalidate: [keys.pricing],
  });

  const v = form.values;
  const example = (km: number, min: number) =>
    Math.max(Number(v.minimumFare) || 0, (Number(v.baseFare) || 0) + (Number(v.perKm) || 0) * km + (Number(v.perMin) || 0) * min);

  return (
    <Paper withBorder radius="md" p="lg">
      <form onSubmit={form.onSubmit((vals) => save.mutate(vals))}>
        <Stack>
          <Group justify="space-between">
            <Group gap="xs">
              <Title order={4}>{humanize(pricing.type)}</Title>
              <StatusBadge value={pricing.type} />
            </Group>
            <SegmentedControl
              data={[
                { value: 'CALCULATED', label: 'Calculated' },
                { value: 'FIXED_ROUTE', label: 'Fixed route' },
              ]}
              {...form.getInputProps('mode')}
            />
          </Group>
          <SimpleGrid cols={2} spacing="sm">
            <NumberInput label="Base fare" prefix="$" min={0} decimalScale={2} {...form.getInputProps('baseFare')} />
            <NumberInput label="Minimum fare" prefix="$" min={0} decimalScale={2} {...form.getInputProps('minimumFare')} />
            <NumberInput label="Per km" prefix="$" min={0} decimalScale={3} {...form.getInputProps('perKm')} />
            <NumberInput label="Per minute" prefix="$" min={0} decimalScale={3} {...form.getInputProps('perMin')} />
          </SimpleGrid>
          <Text size="xs" c="dimmed">
            Calculated example (before rounding): 3 km / 8 min → {formatUsd(example(3, 8))} · 10 km / 20 min →{' '}
            {formatUsd(example(10, 20))}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" disabled={!form.isDirty()} onClick={() => form.reset()}>
              Reset
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!form.isDirty()}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}
