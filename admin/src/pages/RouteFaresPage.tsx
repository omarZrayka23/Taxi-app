import { useEffect, useState } from 'react';
import { ActionIcon, Alert, Button, Group, Modal, NumberInput, Select, Stack, Switch, Text, Tooltip } from '@mantine/core';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { IconArrowRight, IconArrowsLeftRight, IconEdit, IconInfoCircle, IconPlus, IconTrash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { adminApi } from '../api/endpoints';
import { VEHICLE_TYPES, type RouteFare, type RouteFareInput, type VehicleType } from '../api/types';
import { DataTable, type Column } from '../components/DataTable';
import { StatusFilter } from '../components/Filters';
import { PageHeader } from '../components/Layout';
import { QueryState } from '../components/QueryState';
import { StatusBadge } from '../components/StatusBadge';
import { formatLbp, formatUsd, humanize, usdToLbp } from '../lib/format';
import { useApiMutation } from '../lib/notify';
import { keys, usePlaces, useSettings } from '../lib/queries';

const duplicateText = (err: unknown) =>
  err instanceof ApiError && err.code === 'DUPLICATE_ROUTE'
    ? 'A fare for this route and vehicle type already exists. Edit the existing one instead.'
    : undefined;

export default function RouteFaresPage() {
  const query = useQuery({ queryKey: keys.routeFares, queryFn: async () => (await adminApi.routeFares()).items });
  const settings = useSettings();
  const lbpRate = settings.data?.lbpRate;
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);
  const [editing, setEditing] = useState<RouteFare | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const remove = useApiMutation({
    mutationFn: (r: RouteFare) => adminApi.deleteRouteFare(r.id),
    success: 'Route fare deleted',
    invalidate: [keys.routeFares],
  });

  const confirmDelete = (r: RouteFare) =>
    modals.openConfirmModal({
      title: 'Delete route fare?',
      children: (
        <Text size="sm">
          {r.fromPlace.nameEn} → {r.toPlace.nameEn} ({humanize(r.vehicleType)}). Rides on this route will use the calculated
          fare.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(r),
    });

  const columns: Column<RouteFare>[] = [
    {
      key: 'route',
      title: 'Route',
      render: (r) => (
        <Group gap={6} wrap="nowrap">
          <Text size="sm" fw={500}>
            {r.fromPlace.nameEn}
          </Text>
          {r.bidirectional ? <IconArrowsLeftRight size={16} /> : <IconArrowRight size={16} />}
          <Text size="sm" fw={500}>
            {r.toPlace.nameEn}
          </Text>
        </Group>
      ),
    },
    { key: 'type', title: 'Vehicle', render: (r) => <StatusBadge value={r.vehicleType} /> },
    { key: 'usd', title: 'Price (USD)', align: 'right', render: (r) => <Text size="sm" fw={600}>{formatUsd(r.priceUsd)}</Text> },
    {
      key: 'lbp',
      title: 'Price (LBP)',
      align: 'right',
      render: (r) => (
        <Text size="sm" c="dimmed">
          {lbpRate ? formatLbp(usdToLbp(r.priceUsd, lbpRate)) : '—'}
        </Text>
      ),
    },
    { key: 'bi', title: 'Direction', render: (r) => (r.bidirectional ? 'Both ways' : 'One way') },
    {
      key: 'actions',
      title: '',
      align: 'right',
      render: (r) => (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <Tooltip label="Edit">
            <ActionIcon
              variant="subtle"
              aria-label="Edit"
              onClick={() => {
                setEditing(r);
                setFormOpen(true);
              }}
            >
              <IconEdit size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete">
            <ActionIcon variant="subtle" color="red" aria-label="Delete" onClick={() => confirmDelete(r)}>
              <IconTrash size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Route fares"
        description={
          <>
            Fixed prices between two <Link to="/places">places</Link>. Used only for vehicle types whose{' '}
            <Link to="/pricing">pricing mode</Link> is Fixed route.
          </>
        }
        actions={
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Add route fare
          </Button>
        }
      />
      <Group mb="md" justify="space-between" wrap="wrap">
        <StatusFilter options={VEHICLE_TYPES} value={vehicleType} onChange={setVehicleType} />
        <Text size="sm" c="dimmed">
          {lbpRate ? `LBP rate: 1 USD = ${formatLbp(lbpRate)}` : settings.isLoading ? 'Loading LBP rate…' : 'LBP rate unavailable'}
        </Text>
      </Group>
      <QueryState query={query}>
        {(items) => (
          <DataTable
            columns={columns}
            rows={items
              .filter((r) => !vehicleType || r.vehicleType === vehicleType)
              .sort((a, b) => a.fromPlace.nameEn.localeCompare(b.fromPlace.nameEn) || a.toPlace.nameEn.localeCompare(b.toPlace.nameEn))}
            rowKey={(r) => r.id}
            emptyMessage="No route fares yet."
          />
        )}
      </QueryState>
      <RouteFareFormModal opened={formOpen} fare={editing} lbpRate={lbpRate} onClose={() => setFormOpen(false)} />
    </>
  );
}

interface Values {
  fromPlaceId: string | null;
  toPlaceId: string | null;
  vehicleType: VehicleType;
  priceUsd: number | string;
  bidirectional: boolean;
}

const EMPTY: Values = { fromPlaceId: null, toPlaceId: null, vehicleType: 'TAXI', priceUsd: '', bidirectional: true };

function RouteFareFormModal({
  opened,
  fare,
  lbpRate,
  onClose,
}: {
  opened: boolean;
  fare: RouteFare | null;
  lbpRate: number | undefined;
  onClose: () => void;
}) {
  const places = usePlaces();
  const form = useForm<Values>({
    initialValues: EMPTY,
    validate: {
      fromPlaceId: (v) => (v ? null : 'Required'),
      toPlaceId: (v, all) => (!v ? 'Required' : v === all.fromPlaceId ? 'Must differ from the origin' : null),
      priceUsd: (v) => (v !== '' && Number(v) > 0 ? null : 'Enter a price'),
    },
  });

  useEffect(() => {
    if (!opened) return;
    form.setValues(
      fare
        ? {
            fromPlaceId: String(fare.fromPlace.id),
            toPlaceId: String(fare.toPlace.id),
            vehicleType: fare.vehicleType,
            priceUsd: fare.priceUsd,
            bidirectional: fare.bidirectional,
          }
        : EMPTY,
    );
    form.clearErrors();
  }, [opened, fare]);

  const save = useApiMutation({
    mutationFn: (input: RouteFareInput) => (fare ? adminApi.updateRouteFare(fare.id, input) : adminApi.createRouteFare(input)),
    success: fare ? 'Route fare updated' : 'Route fare created',
    invalidate: [keys.routeFares],
    errorText: duplicateText,
    onSuccess: onClose,
  });

  const options = (places.data ?? []).map((p) => ({
    value: String(p.id),
    label: `${p.nameEn} — ${p.nameAr}${p.active ? '' : ' (inactive)'}`,
  }));
  const lbp = usdToLbp(form.values.priceUsd === '' ? null : Number(form.values.priceUsd), lbpRate);

  return (
    <Modal opened={opened} onClose={onClose} title={fare ? 'Edit route fare' : 'Add route fare'} centered>
      <form
        onSubmit={form.onSubmit((v) =>
          save.mutate({
            fromPlaceId: Number(v.fromPlaceId),
            toPlaceId: Number(v.toPlaceId),
            vehicleType: v.vehicleType,
            priceUsd: Number(v.priceUsd),
            bidirectional: v.bidirectional,
          }),
        )}
      >
        <Stack>
          {places.data && places.data.length < 2 && (
            <Alert color="yellow" icon={<IconInfoCircle size={18} />} p="xs">
              Create at least two places first.
            </Alert>
          )}
          <Select label="From" data={options} searchable withAsterisk placeholder="Origin place" {...form.getInputProps('fromPlaceId')} />
          <Select label="To" data={options} searchable withAsterisk placeholder="Destination place" {...form.getInputProps('toPlaceId')} />
          <Select
            label="Vehicle type"
            data={VEHICLE_TYPES.map((t) => ({ value: t, label: humanize(t) }))}
            allowDeselect={false}
            {...form.getInputProps('vehicleType')}
          />
          <NumberInput
            label="Price"
            prefix="$"
            min={0}
            decimalScale={2}
            withAsterisk
            description={lbp !== null ? `≈ ${formatLbp(lbp)}` : undefined}
            {...form.getInputProps('priceUsd')}
          />
          <Switch
            label="Bidirectional (same price for the return trip)"
            {...form.getInputProps('bidirectional', { type: 'checkbox' })}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {fare ? 'Save' : 'Create'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
