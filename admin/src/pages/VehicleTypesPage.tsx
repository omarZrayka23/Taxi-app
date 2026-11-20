import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { IconEdit, IconInfoCircle, IconPlus, IconTrash } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { adminApi } from '../api/endpoints';
import { VEHICLE_ICONS, type AdminVehicleType, type PricingMode, type VehicleIcon, type VehicleTypeInput } from '../api/types';
import { DataTable, type Column } from '../components/DataTable';
import { PageHeader } from '../components/Layout';
import { QueryState } from '../components/QueryState';
import { StatusBadge } from '../components/StatusBadge';
import { formatUsd, humanize } from '../lib/format';
import { useApiMutation } from '../lib/notify';
import { keys, useVehicleTypes } from '../lib/queries';

const invalidateAll = [keys.vehicleTypes, keys.routeFares];

export default function VehicleTypesPage() {
  const query = useVehicleTypes();
  const [editing, setEditing] = useState<AdminVehicleType | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const toggle = useApiMutation({
    mutationFn: (t: AdminVehicleType) => adminApi.updateVehicleType(t.code, { active: !t.active }),
    success: (d) => `${d.vehicleType.nameEn} ${d.vehicleType.active ? 'turned on' : 'turned off'}`,
    invalidate: invalidateAll,
  });

  const onToggle = (t: AdminVehicleType) => {
    if (t.active && t.driverCount > 0) {
      modals.openConfirmModal({
        title: `Turn off “${t.nameEn}”?`,
        children: (
          <Text size="sm">
            {t.driverCount} {t.driverCount === 1 ? 'driver uses' : 'drivers use'} this type and won't get rides while it's off.
          </Text>
        ),
        labels: { confirm: 'Turn off', cancel: 'Cancel' },
        confirmProps: { color: 'red' },
        onConfirm: () => toggle.mutate(t),
      });
      return;
    }
    toggle.mutate(t);
  };

  const remove = useApiMutation({
    mutationFn: (t: AdminVehicleType) => adminApi.deleteVehicleType(t.code),
    success: 'Vehicle type deleted',
    invalidate: invalidateAll,
  });

  const confirmDelete = (t: AdminVehicleType) =>
    modals.openConfirmModal({
      title: `Delete “${t.nameEn}”?`,
      children: (
        <Text size="sm">Types used by drivers, rides or route fares cannot be deleted — turn them off instead.</Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(t),
    });

  const columns: Column<AdminVehicleType>[] = [
    { key: 'order', title: 'Order', render: (t) => t.sortOrder },
    {
      key: 'name',
      title: 'Name',
      render: (t) => (
        <Stack gap={0}>
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" fw={500}>
              {t.nameEn}
            </Text>
            <Text size="xs" c="dimmed">
              {t.code}
            </Text>
          </Group>
          <Text size="sm" c="dimmed" dir="rtl" ta="left">
            {t.nameAr}
          </Text>
        </Stack>
      ),
    },
    { key: 'icon', title: 'Icon', render: (t) => humanize(t.icon) },
    { key: 'capacity', title: 'Capacity', render: (t) => t.capacity },
    { key: 'mode', title: 'Pricing', render: (t) => <StatusBadge value={t.mode} /> },
    { key: 'min', title: 'Min fare', render: (t) => formatUsd(t.minimumFare) },
    { key: 'fee', title: 'Monthly fee', render: (t) => formatUsd(t.monthlyFeeUsd) },
    { key: 'drivers', title: 'Drivers', render: (t) => t.driverCount },
    {
      key: 'active',
      title: 'Active',
      render: (t) => (
        <Switch
          checked={t.active}
          disabled={toggle.isPending && toggle.variables?.code === t.code}
          onChange={() => onToggle(t)}
          aria-label="Active"
        />
      ),
    },
    {
      key: 'actions',
      title: '',
      align: 'right',
      render: (t) => (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <Tooltip label="Edit">
            <ActionIcon
              variant="subtle"
              onClick={() => {
                setEditing(t);
                setFormOpen(true);
              }}
              aria-label="Edit"
            >
              <IconEdit size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete">
            <ActionIcon variant="subtle" color="red" onClick={() => confirmDelete(t)} aria-label="Delete">
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
        title="Vehicle types"
        description="The vehicle types riders can book and drivers can register with, and how each is priced."
        actions={
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Add vehicle type
          </Button>
        }
      />
      <Alert color="blue" icon={<IconInfoCircle size={18} />} mb="md">
        <Text size="sm">
          <b>Calculated</b>: fare = max(minimum fare, base fare + per km × distance + per minute × duration), rounded up to the
          fare rounding step from Settings.
        </Text>
        <Text size="sm" mt={4}>
          <b>Fixed route</b>: pickup and drop-off are matched to the nearest active <Link to="/places">place</Link>; if a{' '}
          <Link to="/route-fares">route fare</Link> exists for that pair and vehicle type its price is used. When no route price
          exists, the fare <b>falls back to the calculated formula</b> — so keep those values filled in.
        </Text>
      </Alert>
      <QueryState query={query}>
        {(types) => <DataTable columns={columns} rows={types} rowKey={(t) => t.code} emptyMessage="No vehicle types yet." />}
      </QueryState>
      <VehicleTypeFormModal
        opened={formOpen}
        type={editing}
        nextOrder={Math.max(0, ...(query.data ?? []).map((t) => t.sortOrder)) + 1}
        onClose={() => setFormOpen(false)} />
    </>
  );
}

interface Values {
  code: string;
  nameEn: string;
  nameAr: string;
  icon: VehicleIcon;
  capacity: number | string;
  mode: PricingMode;
  baseFare: number | string;
  perKm: number | string;
  perMin: number | string;
  minimumFare: number | string;
  monthlyFeeUsd: number | string;
  sortOrder: number | string;
  active: boolean;
}

const EMPTY: Values = {
  code: '',
  nameEn: '',
  nameAr: '',
  icon: 'CAR',
  capacity: 4,
  mode: 'CALCULATED',
  baseFare: 0,
  perKm: 0,
  perMin: 0,
  minimumFare: 0,
  monthlyFeeUsd: 0,
  sortOrder: 0,
  active: true,
};

const CODE_RULE = 'Capital letters, digits and _; starts with a letter; max 20.';
const nonNegative = (v: number | string) => (v !== '' && Number(v) >= 0 ? null : 'Zero or more');
const nameRule = (v: string) => (v.trim() && v.trim().length <= 60 ? null : '1–60 characters');

function VehicleTypeFormModal({
  opened,
  type,
  nextOrder,
  onClose,
}: {
  opened: boolean;
  type: AdminVehicleType | null;
  nextOrder: number;
  onClose: () => void;
}) {
  const form = useForm<Values>({
    initialValues: EMPTY,
    validate: {
      code: (v) => (/^[A-Z][A-Z0-9_]{0,19}$/.test(v) ? null : CODE_RULE),
      nameEn: nameRule,
      nameAr: nameRule,
      capacity: (v) => (v !== '' && Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 100 ? null : 'Whole number 1–100'),
      baseFare: nonNegative,
      perKm: nonNegative,
      perMin: nonNegative,
      minimumFare: nonNegative,
      monthlyFeeUsd: nonNegative,
      sortOrder: (v) => (v !== '' && Number.isInteger(Number(v)) && Number(v) >= 0 ? null : 'Whole number, 0 or more'),
    },
  });

  useEffect(() => {
    if (!opened) return;
    form.setValues(
      type
        ? {
            code: type.code,
            nameEn: type.nameEn,
            nameAr: type.nameAr,
            icon: type.icon,
            capacity: type.capacity,
            mode: type.mode,
            baseFare: type.baseFare,
            perKm: type.perKm,
            perMin: type.perMin,
            minimumFare: type.minimumFare,
            monthlyFeeUsd: type.monthlyFeeUsd,
            sortOrder: type.sortOrder,
            active: type.active,
          }
        : { ...EMPTY, sortOrder: nextOrder },
    );
    form.clearErrors();
  }, [opened, type]);

  const save = useApiMutation({
    mutationFn: (input: VehicleTypeInput) => {
      if (!type) return adminApi.createVehicleType(input);
      const { code: _code, ...rest } = input;
      return adminApi.updateVehicleType(type.code, rest);
    },
    success: type ? 'Vehicle type updated' : 'Vehicle type created',
    invalidate: invalidateAll,
    onSuccess: onClose,
  });

  const v = form.values;
  const example = (km: number, min: number) =>
    Math.max(Number(v.minimumFare) || 0, (Number(v.baseFare) || 0) + (Number(v.perKm) || 0) * km + (Number(v.perMin) || 0) * min);

  return (
    <Modal opened={opened} onClose={onClose} title={type ? 'Edit vehicle type' : 'Add vehicle type'} centered size="lg">
      <form
        onSubmit={form.onSubmit((vals) =>
          save.mutate({
            code: vals.code,
            nameEn: vals.nameEn.trim(),
            nameAr: vals.nameAr.trim(),
            icon: vals.icon,
            capacity: Number(vals.capacity),
            mode: vals.mode,
            baseFare: Number(vals.baseFare),
            perKm: Number(vals.perKm),
            perMin: Number(vals.perMin),
            minimumFare: Number(vals.minimumFare),
            monthlyFeeUsd: Number(vals.monthlyFeeUsd),
            sortOrder: Number(vals.sortOrder),
            active: vals.active,
          }),
        )}
      >
        <Stack>
          <TextInput
            label="Code"
            description={CODE_RULE}
            placeholder="VAN_8"
            withAsterisk
            readOnly={!!type}
            {...form.getInputProps('code')}
            onChange={(e) => form.setFieldValue('code', e.currentTarget.value.toUpperCase())}
          />
          <SimpleGrid cols={2} spacing="sm">
            <TextInput label="Name (English)" placeholder="Van 8" withAsterisk {...form.getInputProps('nameEn')} />
            <TextInput label="Name (Arabic)" placeholder="فان ٨" dir="rtl" withAsterisk {...form.getInputProps('nameAr')} />
            <Select
              label="Icon"
              data={VEHICLE_ICONS.map((i) => ({ value: i, label: humanize(i) }))}
              allowDeselect={false}
              {...form.getInputProps('icon')}
            />
            <NumberInput
              label="Capacity"
              description="Passenger seats"
              min={1}
              max={100}
              allowDecimal={false}
              withAsterisk
              {...form.getInputProps('capacity')}
            />
          </SimpleGrid>
          <div>
            <Text size="sm" fw={500} mb={4}>
              Pricing mode
            </Text>
            <SegmentedControl
              data={[
                { value: 'CALCULATED', label: 'Calculated' },
                { value: 'FIXED_ROUTE', label: 'Fixed route' },
              ]}
              {...form.getInputProps('mode')}
            />
          </div>
          <SimpleGrid cols={2} spacing="sm">
            <NumberInput label="Base fare" prefix="$" min={0} decimalScale={2} {...form.getInputProps('baseFare')} />
            <NumberInput label="Minimum fare" prefix="$" min={0} decimalScale={2} {...form.getInputProps('minimumFare')} />
            <NumberInput label="Per km" prefix="$" min={0} decimalScale={3} {...form.getInputProps('perKm')} />
            <NumberInput label="Per minute" prefix="$" min={0} decimalScale={3} {...form.getInputProps('perMin')} />
            <NumberInput
              label="Monthly fee"
              description="Drivers on the Monthly plan"
              prefix="$"
              min={0}
              decimalScale={2}
              {...form.getInputProps('monthlyFeeUsd')}
            />
            <NumberInput label="Order" description="Lower shows first" allowDecimal={false} min={0} {...form.getInputProps('sortOrder')} />
          </SimpleGrid>
          <Text size="xs" c="dimmed">
            Calculated example (before rounding): 3 km / 8 min → {formatUsd(example(3, 8))} · 10 km / 20 min →{' '}
            {formatUsd(example(10, 20))}
          </Text>
          <Switch label="Active" {...form.getInputProps('active', { type: 'checkbox' })} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {type ? 'Save' : 'Create'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
