import { useEffect, useState } from 'react';
import { ActionIcon, Anchor, Button, Group, Modal, NumberInput, SimpleGrid, Stack, Switch, Text, TextInput, Tooltip } from '@mantine/core';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { ApiError } from '../api/client';
import { adminApi } from '../api/endpoints';
import type { Place, PlaceInput } from '../api/types';
import { DataTable, type Column } from '../components/DataTable';
import { PageHeader } from '../components/Layout';
import { QueryState } from '../components/QueryState';
import { formatNumber } from '../lib/format';
import { useApiMutation } from '../lib/notify';
import { keys, usePlaces } from '../lib/queries';

export default function PlacesPage() {
  const query = usePlaces();
  const [editing, setEditing] = useState<Place | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const toggle = useApiMutation({
    mutationFn: (p: Place) => adminApi.updatePlace(p.id, { active: !p.active }),
    success: (d) => `${d.place.nameEn} ${d.place.active ? 'activated' : 'deactivated'}`,
    invalidate: [keys.places],
  });

  const remove = useApiMutation({
    mutationFn: (p: Place) => adminApi.deletePlace(p.id),
    success: 'Place deleted',
    invalidate: [keys.places, keys.routeFares],
    errorText: (err) =>
      err instanceof ApiError && err.code === 'PLACE_IN_USE'
        ? 'Rental listings reference this place. Deactivate it instead.'
        : undefined,
  });

  const confirmDelete = (p: Place) =>
    modals.openConfirmModal({
      title: `Delete “${p.nameEn}”?`,
      children: (
        <Text size="sm">
          Route fares using this place may be removed. Places used by rental listings cannot be deleted — deactivate them instead.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(p),
    });

  const columns: Column<Place>[] = [
    {
      key: 'name',
      title: 'Name',
      render: (p) => (
        <Stack gap={0}>
          <Text size="sm" fw={500}>
            {p.nameEn}
          </Text>
          <Text size="sm" c="dimmed" dir="rtl" ta="left">
            {p.nameAr}
          </Text>
        </Stack>
      ),
    },
    {
      key: 'coords',
      title: 'Coordinates',
      render: (p) => (
        <Anchor href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noreferrer" size="sm">
          {formatNumber(p.lat, 5)}, {formatNumber(p.lng, 5)}
        </Anchor>
      ),
    },
    { key: 'radius', title: 'Radius', render: (p) => `${formatNumber(p.radiusKm, 2)} km` },
    {
      key: 'active',
      title: 'Active',
      render: (p) => (
        <Switch
          checked={p.active}
          disabled={toggle.isPending && toggle.variables?.id === p.id}
          onChange={() => toggle.mutate(p)}
          aria-label="Active"
        />
      ),
    },
    {
      key: 'actions',
      title: '',
      align: 'right',
      render: (p) => (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <Tooltip label="Edit">
            <ActionIcon
              variant="subtle"
              onClick={() => {
                setEditing(p);
                setFormOpen(true);
              }}
              aria-label="Edit"
            >
              <IconEdit size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete">
            <ActionIcon variant="subtle" color="red" onClick={() => confirmDelete(p)} aria-label="Delete">
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
        title="Places"
        description="Named areas (towns, landmarks) used for fixed route fares and rental car locations."
        actions={
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Add place
          </Button>
        }
      />
      <QueryState query={query}>
        {(places) => (
          <DataTable
            columns={columns}
            rows={[...places].sort((a, b) => a.nameEn.localeCompare(b.nameEn))}
            rowKey={(p) => p.id}
            emptyMessage="No places yet."
          />
        )}
      </QueryState>
      <PlaceFormModal opened={formOpen} place={editing} onClose={() => setFormOpen(false)} />
    </>
  );
}

interface Values {
  nameEn: string;
  nameAr: string;
  lat: number | string;
  lng: number | string;
  radiusKm: number | string;
  active: boolean;
}

const EMPTY: Values = { nameEn: '', nameAr: '', lat: '', lng: '', radiusKm: 1, active: true };

function PlaceFormModal({ opened, place, onClose }: { opened: boolean; place: Place | null; onClose: () => void }) {
  const form = useForm<Values>({
    initialValues: EMPTY,
    validate: {
      nameEn: (v) => (v.trim() ? null : 'Required'),
      nameAr: (v) => (v.trim() ? null : 'Required'),
      lat: (v) => (v !== '' && Math.abs(Number(v)) <= 90 ? null : 'Latitude between -90 and 90'),
      lng: (v) => (v !== '' && Math.abs(Number(v)) <= 180 ? null : 'Longitude between -180 and 180'),
      radiusKm: (v) => (v !== '' && Number(v) >= 0.1 && Number(v) <= 50 ? null : 'Between 0.1 and 50 km'),
    },
  });

  useEffect(() => {
    if (!opened) return;
    form.setValues(
      place
        ? { nameEn: place.nameEn, nameAr: place.nameAr, lat: place.lat, lng: place.lng, radiusKm: place.radiusKm, active: place.active }
        : EMPTY,
    );
    form.clearErrors();
  }, [opened, place]);

  const save = useApiMutation({
    mutationFn: (input: PlaceInput) => (place ? adminApi.updatePlace(place.id, input) : adminApi.createPlace(input)),
    success: place ? 'Place updated' : 'Place created',
    invalidate: [keys.places, keys.routeFares],
    onSuccess: onClose,
  });

  return (
    <Modal opened={opened} onClose={onClose} title={place ? 'Edit place' : 'Add place'} centered>
      <form
        onSubmit={form.onSubmit((v) =>
          save.mutate({
            nameEn: v.nameEn.trim(),
            nameAr: v.nameAr.trim(),
            lat: Number(v.lat),
            lng: Number(v.lng),
            radiusKm: Number(v.radiusKm),
            active: v.active,
          }),
        )}
      >
        <Stack>
          <TextInput label="Name (English)" placeholder="Minieh Square" withAsterisk {...form.getInputProps('nameEn')} />
          <TextInput label="Name (Arabic)" placeholder="ساحة المنية" dir="rtl" withAsterisk {...form.getInputProps('nameAr')} />
          <SimpleGrid cols={2} spacing="sm">
            <NumberInput label="Latitude" placeholder="34.4790" decimalScale={6} withAsterisk {...form.getInputProps('lat')} />
            <NumberInput label="Longitude" placeholder="35.9850" decimalScale={6} withAsterisk {...form.getInputProps('lng')} />
          </SimpleGrid>
          <Text size="xs" c="dimmed" mt={-8}>
            Tip: right-click a spot in Google Maps to copy its coordinates.
          </Text>
          <NumberInput
            label="Radius"
            description="Pickups/drop-offs within this distance match the place"
            suffix=" km"
            min={0.1}
            max={50}
            step={0.5}
            decimalScale={2}
            withAsterisk
            {...form.getInputProps('radiusKm')}
          />
          <Switch label="Active" {...form.getInputProps('active', { type: 'checkbox' })} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {place ? 'Save' : 'Create'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
