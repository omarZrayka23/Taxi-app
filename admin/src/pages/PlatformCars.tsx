import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Drawer,
  FileButton,
  Grid,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconCheck, IconEdit, IconInfoCircle, IconPlus, IconUpload } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, ownerApi } from '../api/endpoints';
import { FUEL_TYPES, TRANSMISSIONS, type FuelType, type Listing, type ListingInput, type Transmission } from '../api/types';
import { DataTable } from '../components/DataTable';
import { SectionTitle } from '../components/Layout';
import { listingColumns } from '../components/listingColumns';
import { ListingDetails, PhotoGrid } from '../components/ListingView';
import { ErrorState, LoadingState } from '../components/QueryState';
import { humanize } from '../lib/format';
import { notifyError, useApiMutation } from '../lib/notify';
import { keys, usePlaces } from '../lib/queries';

const MAX_PHOTOS = 6;
const platformColumns = listingColumns.filter((c) => c.key !== 'owner');

/** Admin-owned cars, managed through the same /owner/listings endpoints as normal owners. */
export function PlatformCars() {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Listing | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const query = useQuery({
    queryKey: keys.platformListings,
    queryFn: async () => (await ownerApi.listings()).listings,
  });

  const selected = query.data?.find((l) => l.id === selectedId) ?? null;

  /** Put a fresh listing returned by any mutation into the cache. */
  const applyListing = (listing: Listing) => {
    qc.setQueryData<Listing[]>(keys.platformListings, (old) => {
      if (!old) return [listing];
      return old.some((l) => l.id === listing.id) ? old.map((l) => (l.id === listing.id ? listing : l)) : [listing, ...old];
    });
    void qc.invalidateQueries({ queryKey: ['admin', 'listings'] });
  };

  return (
    <>
      <Group justify="space-between" mb="md" wrap="wrap">
        <Text size="sm" c="dimmed" maw={640}>
          Cars owned by Minieh Rides. No rental commission is charged on these. New cars start as <b>Pending</b> — approve them
          from the car's panel to make them visible to renters.
        </Text>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          Add car
        </Button>
      </Group>

      {query.isLoading ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <DataTable
          columns={platformColumns}
          rows={query.data ?? []}
          rowKey={(l) => l.id}
          onRowClick={(l) => setSelectedId(l.id)}
          emptyMessage="No platform cars yet. Click “Add car” to create one."
        />
      )}

      <ListingFormModal
        opened={formOpen}
        listing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(listing, created) => {
          applyListing(listing);
          setFormOpen(false);
          if (created) setSelectedId(listing.id);
        }}
      />

      <PlatformCarDrawer
        listing={selected}
        onClose={() => setSelectedId(null)}
        onEdit={(l) => {
          setEditing(l);
          setFormOpen(true);
        }}
        onChanged={applyListing}
      />
    </>
  );
}

function PlatformCarDrawer({
  listing,
  onClose,
  onEdit,
  onChanged,
}: {
  listing: Listing | null;
  onClose: () => void;
  onEdit: (l: Listing) => void;
  onChanged: (l: Listing) => void;
}) {
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const approve = useApiMutation({
    mutationFn: (id: number) => adminApi.listingAction(id, 'approve'),
    success: 'Car approved and visible to renters',
    invalidate: [['admin', 'stats']],
    onSuccess: (d) => onChanged(d.listing),
  });

  const toggleActive = useApiMutation({
    mutationFn: (vars: { id: number; isActive: boolean }) => ownerApi.updateListing(vars.id, { isActive: vars.isActive }),
    success: (_d, v) => (v.isActive ? 'Car activated' : 'Car hidden from renters'),
    onSuccess: (d) => onChanged(d.listing),
  });

  const upload = useApiMutation({
    mutationFn: (vars: { id: number; files: File[] }) => ownerApi.uploadPhotos(vars.id, vars.files),
    success: (_d, v) => `${v.files.length} photo(s) uploaded`,
    onSuccess: (d) => onChanged(d.listing),
  });

  const deletePhoto = useApiMutation({
    mutationFn: (vars: { id: number; photoId: number }) => ownerApi.deletePhoto(vars.id, vars.photoId),
    success: 'Photo deleted',
    onSuccess: (d) => onChanged(d.listing),
  });

  const remaining = listing ? MAX_PHOTOS - listing.photos.length : 0;

  const onFiles = (files: File[]) => {
    if (!listing || !files.length) return;
    if (files.length > remaining) {
      notifyError(new Error(`You can add at most ${remaining} more photo(s) (max ${MAX_PHOTOS}).`), 'Too many photos');
      return;
    }
    upload.mutate({ id: listing.id, files });
  };

  return (
    <Drawer opened={listing !== null} onClose={onClose} position="right" size="xl" title="Platform car">
      {listing && (
        <Stack gap="xs">
          <ListingDetails listing={listing} />
          <Group gap="xs" mt="sm">
            <Button variant="light" leftSection={<IconEdit size={16} />} onClick={() => onEdit(listing)}>
              Edit
            </Button>
            {listing.status !== 'APPROVED' && (
              <Button
                color="teal"
                leftSection={<IconCheck size={16} />}
                loading={approve.isPending}
                onClick={() => approve.mutate(listing.id)}
              >
                Approve
              </Button>
            )}
            <Switch
              ml="sm"
              label="Active (visible to renters)"
              checked={listing.isActive}
              disabled={toggleActive.isPending}
              onChange={(e) => toggleActive.mutate({ id: listing.id, isActive: e.currentTarget.checked })}
            />
          </Group>
          <Divider my="xs" />
          <Group justify="space-between" align="center">
            <SectionTitle>
              Photos ({listing.photos.length}/{MAX_PHOTOS})
            </SectionTitle>
            <FileButton onChange={onFiles} accept="image/png,image/jpeg,image/webp" multiple>
              {(props) => (
                <Button
                  {...props}
                  size="xs"
                  variant="light"
                  leftSection={<IconUpload size={14} />}
                  loading={upload.isPending}
                  disabled={remaining <= 0}
                >
                  Upload photos
                </Button>
              )}
            </FileButton>
          </Group>
          <PhotoGrid
            photos={listing.photos}
            deletingId={deletingId}
            onDelete={(p) => {
              setDeletingId(p.id);
              deletePhoto.mutate(
                { id: listing.id, photoId: p.id },
                { onSettled: () => setDeletingId(null) },
              );
            }}
          />
        </Stack>
      )}
    </Drawer>
  );
}

interface FormValues {
  make: string;
  model: string;
  year: number | string;
  seats: number | string;
  transmission: Transmission;
  fuelType: FuelType;
  color: string;
  placeId: string | null;
  description: string;
  selfDrive: boolean;
  pricePerDayUsd: number | string;
  withDriver: boolean;
  withDriverPricePerDayUsd: number | string;
  depositUsd: number | string;
  minDays: number | string;
}

const EMPTY: FormValues = {
  make: '',
  model: '',
  year: new Date().getFullYear(),
  seats: 5,
  transmission: 'AUTOMATIC',
  fuelType: 'GASOLINE',
  color: '',
  placeId: null,
  description: '',
  selfDrive: true,
  pricePerDayUsd: '',
  withDriver: false,
  withDriverPricePerDayUsd: '',
  depositUsd: 0,
  minDays: 1,
};

function toValues(l: Listing): FormValues {
  return {
    make: l.make,
    model: l.model,
    year: l.year,
    seats: l.seats,
    transmission: l.transmission,
    fuelType: l.fuelType,
    color: l.color,
    placeId: String(l.place.id),
    description: l.description ?? '',
    selfDrive: l.selfDrive,
    pricePerDayUsd: l.pricePerDayUsd ?? '',
    withDriver: l.withDriver,
    withDriverPricePerDayUsd: l.withDriverPricePerDayUsd ?? '',
    depositUsd: l.depositUsd,
    minDays: l.minDays,
  };
}

const isNum = (v: number | string) => v !== '' && Number.isFinite(Number(v));

function toInput(v: FormValues): ListingInput {
  return {
    make: v.make.trim(),
    model: v.model.trim(),
    year: Number(v.year),
    seats: Number(v.seats),
    transmission: v.transmission,
    fuelType: v.fuelType,
    color: v.color.trim(),
    placeId: Number(v.placeId),
    description: v.description.trim() || undefined,
    selfDrive: v.selfDrive,
    pricePerDayUsd: v.selfDrive ? Number(v.pricePerDayUsd) : null,
    withDriver: v.withDriver,
    withDriverPricePerDayUsd: v.withDriver ? Number(v.withDriverPricePerDayUsd) : null,
    depositUsd: Number(v.depositUsd),
    minDays: Number(v.minDays),
  };
}

function ListingFormModal({
  opened,
  listing,
  onClose,
  onSaved,
}: {
  opened: boolean;
  listing: Listing | null;
  onClose: () => void;
  onSaved: (l: Listing, created: boolean) => void;
}) {
  const places = usePlaces();
  const maxYear = new Date().getFullYear() + 1;

  const form = useForm<FormValues>({
    initialValues: EMPTY,
    validate: {
      make: (v) => (v.trim() ? null : 'Required'),
      model: (v) => (v.trim() ? null : 'Required'),
      color: (v) => (v.trim() ? null : 'Required'),
      year: (v) => (isNum(v) && Number(v) >= 1970 && Number(v) <= maxYear ? null : `1970–${maxYear}`),
      seats: (v) => (isNum(v) && Number(v) >= 1 ? null : 'At least 1'),
      placeId: (v) => (v ? null : 'Choose a location'),
      pricePerDayUsd: (v, all) => (!all.selfDrive || (isNum(v) && Number(v) > 0) ? null : 'Enter the daily price'),
      withDriverPricePerDayUsd: (v, all) =>
        !all.withDriver || (isNum(v) && Number(v) > 0) ? null : 'Enter the daily price',
      withDriver: (v, all) => (v || all.selfDrive ? null : 'Offer self-drive, with driver, or both'),
      depositUsd: (v) => (isNum(v) && Number(v) >= 0 ? null : 'Zero or more'),
      minDays: (v) => (isNum(v) && Number(v) >= 1 ? null : 'At least 1'),
    },
  });

  useEffect(() => {
    if (opened) {
      const values = listing ? toValues(listing) : EMPTY;
      form.setValues(values);
      form.resetDirty(values);
      form.clearErrors();
    }
  }, [opened, listing]);

  const save = useApiMutation({
    mutationFn: (input: ListingInput) =>
      listing ? ownerApi.updateListing(listing.id, input) : ownerApi.createListing(input),
    success: listing ? 'Car updated' : 'Car created — now add photos',
    onSuccess: (d) => onSaved(d.listing, !listing),
  });

  const placeOptions = (places.data ?? []).map((p) => ({
    value: String(p.id),
    label: `${p.nameEn} — ${p.nameAr}${p.active ? '' : ' (inactive)'}`,
  }));

  return (
    <Modal opened={opened} onClose={onClose} title={listing ? 'Edit platform car' : 'Add platform car'} size="lg" centered>
      <form onSubmit={form.onSubmit((v) => save.mutate(toInput(v)))}>
        <Stack>
          {listing && listing.status === 'APPROVED' && (
            <Alert color="blue" icon={<IconInfoCircle size={18} />} p="xs">
              Depending on server rules, editing may send the car back to review.
            </Alert>
          )}
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label="Make" placeholder="Toyota" withAsterisk {...form.getInputProps('make')} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label="Model" placeholder="Corolla" withAsterisk {...form.getInputProps('model')} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <NumberInput label="Year" min={1970} max={maxYear} allowDecimal={false} withAsterisk {...form.getInputProps('year')} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 3 }}>
              <NumberInput label="Seats" min={1} max={60} allowDecimal={false} withAsterisk {...form.getInputProps('seats')} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label="Color" placeholder="White" withAsterisk {...form.getInputProps('color')} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Select
                label="Transmission"
                data={TRANSMISSIONS.map((t) => ({ value: t, label: humanize(t) }))}
                allowDeselect={false}
                {...form.getInputProps('transmission')}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Select
                label="Fuel"
                data={FUEL_TYPES.map((t) => ({ value: t, label: humanize(t) }))}
                allowDeselect={false}
                {...form.getInputProps('fuelType')}
              />
            </Grid.Col>
            <Grid.Col span={12}>
              <Select
                label="Location (place)"
                placeholder={places.isLoading ? 'Loading places…' : 'Choose a place'}
                data={placeOptions}
                searchable
                withAsterisk
                nothingFoundMessage="No places — create one on the Places page"
                {...form.getInputProps('placeId')}
              />
            </Grid.Col>
            <Grid.Col span={12}>
              <Textarea label="Description" autosize minRows={2} {...form.getInputProps('description')} />
            </Grid.Col>

            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Checkbox label="Self-drive available" mb={6} {...form.getInputProps('selfDrive', { type: 'checkbox' })} />
              <NumberInput
                label="Self-drive price / day"
                prefix="$"
                min={0}
                decimalScale={2}
                disabled={!form.values.selfDrive}
                {...form.getInputProps('pricePerDayUsd')}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Checkbox label="With driver available" mb={6} {...form.getInputProps('withDriver', { type: 'checkbox' })} />
              <NumberInput
                label="With-driver price / day"
                prefix="$"
                min={0}
                decimalScale={2}
                disabled={!form.values.withDriver}
                {...form.getInputProps('withDriverPricePerDayUsd')}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 6 }}>
              <NumberInput label="Deposit" prefix="$" min={0} decimalScale={2} {...form.getInputProps('depositUsd')} />
            </Grid.Col>
            <Grid.Col span={{ base: 6 }}>
              <NumberInput label="Minimum days" min={1} allowDecimal={false} {...form.getInputProps('minDays')} />
            </Grid.Col>
          </Grid>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {listing ? 'Save changes' : 'Create car'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
