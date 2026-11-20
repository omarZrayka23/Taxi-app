import { useState } from 'react';
import { Anchor, Button, Divider, Drawer, Group, Stack, Text, Timeline } from '@mantine/core';
import { IconBan } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../api/endpoints';
import { ACTIVE_RIDE_STATUSES, RIDE_STATUSES, type Ride, type RideStatus } from '../api/types';
import { PaginatedTable, type Column } from '../components/DataTable';
import { StatusFilter } from '../components/Filters';
import { InfoGrid, PageHeader, PersonCell, SectionTitle } from '../components/Layout';
import { ErrorState, LoadingState } from '../components/QueryState';
import { ReasonModal } from '../components/ReasonModal';
import { StatusBadge } from '../components/StatusBadge';
import { VehicleBadge } from '../components/VehicleBadge';
import { formatDateTime, formatLbp, formatNumber, formatUsd, humanize } from '../lib/format';
import { useApiMutation } from '../lib/notify';

const columns: Column<Ride>[] = [
  { key: 'id', title: '#', render: (r) => <Text size="sm" c="dimmed">#{r.id}</Text>, width: 70 },
  { key: 'when', title: 'Requested', render: (r) => formatDateTime(r.requestedAt) },
  { key: 'type', title: 'Type', render: (r) => <VehicleBadge code={r.vehicleType} vehicle={r.vehicle} /> },
  {
    key: 'route',
    title: 'Route',
    render: (r) => (
      <Stack gap={0} maw={320}>
        <Text size="sm" truncate>
          {r.pickupAddress}
        </Text>
        <Text size="xs" c="dimmed" truncate>
          → {r.dropoffAddress}
        </Text>
      </Stack>
    ),
  },
  { key: 'passenger', title: 'Passenger', render: (r) => <PersonCell name={r.passenger.name} phone={r.passenger.phone} /> },
  {
    key: 'driver',
    title: 'Driver',
    render: (r) =>
      r.driver ? (
        <PersonCell name={r.driver.name} phone={r.driver.plateNumber} />
      ) : (
        <Text size="sm" c="dimmed">
          —
        </Text>
      ),
  },
  { key: 'fare', title: 'Fare', align: 'right', render: (r) => <Text size="sm" fw={500}>{formatUsd(r.fareUsd)}</Text> },
  { key: 'status', title: 'Status', render: (r) => <StatusBadge value={r.status} /> },
];

export default function RidesPage() {
  const [status, setStatus] = useState<RideStatus | null>(null);
  const [selected, setSelected] = useState<Ride | null>(null);

  return (
    <>
      <PageHeader title="Rides" description="All rides, newest first." />
      <Group mb="md">
        <StatusFilter options={RIDE_STATUSES} value={status} onChange={setStatus} />
      </Group>
      <PaginatedTable
        queryKey={['admin', 'rides', 'list', { status }]}
        fetchPage={(page) => adminApi.rides({ status, page })}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={setSelected}
        emptyMessage="No rides match this filter."
      />
      <RideDrawer initial={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function mapsLink(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function RideDrawer({ initial, onClose }: { initial: Ride | null; onClose: () => void }) {
  const rideId = initial?.id ?? null;
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);

  const query = useQuery({
    queryKey: ['admin', 'rides', 'detail', rideId],
    queryFn: async () => (await adminApi.ride(rideId!)).ride,
    enabled: rideId !== null,
    // Show the row from the list immediately, then refresh from GET /rides/:id.
    placeholderData: initial ?? undefined,
  });

  const cancel = useApiMutation({
    mutationFn: (reason: string) => adminApi.cancelRide(rideId!, reason || undefined),
    success: 'Ride cancelled',
    invalidate: [['admin', 'rides', 'list'], ['admin', 'stats']],
    onSuccess: (d) => {
      qc.setQueryData(['admin', 'rides', 'detail', rideId], d.ride);
      setCancelOpen(false);
    },
  });

  const r = query.data;

  return (
    <Drawer opened={rideId !== null} onClose={onClose} position="right" size="xl" title={`Ride #${rideId ?? ''}`}>
      {query.isLoading && <LoadingState />}
      {query.error && !r && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {r && (
        <Stack gap="xs">
          <Group justify="space-between">
            <Group gap={6}>
              <StatusBadge value={r.status} />
              <VehicleBadge code={r.vehicleType} vehicle={r.vehicle} />
              <StatusBadge value={r.pricingMode} />
            </Group>
            {ACTIVE_RIDE_STATUSES.includes(r.status) && (
              <Button color="red" variant="light" leftSection={<IconBan size={16} />} onClick={() => setCancelOpen(true)}>
                Cancel ride
              </Button>
            )}
          </Group>

          {r.status === 'CANCELLED' && (
            <Text size="sm" c="red">
              Cancelled by {humanize(r.cancelledBy)}
              {r.cancelReason ? `: ${r.cancelReason}` : ''}
            </Text>
          )}

          <SectionTitle>Trip</SectionTitle>
          <InfoGrid
            items={[
              {
                label: 'Pickup',
                value: (
                  <Anchor href={mapsLink(r.pickupLat, r.pickupLng)} target="_blank" rel="noreferrer" size="sm">
                    {r.pickupAddress}
                  </Anchor>
                ),
              },
              {
                label: 'Dropoff',
                value: (
                  <Anchor href={mapsLink(r.dropoffLat, r.dropoffLng)} target="_blank" rel="noreferrer" size="sm">
                    {r.dropoffAddress}
                  </Anchor>
                ),
              },
              { label: 'Distance', value: `${formatNumber(r.distanceKm, 1)} km` },
              { label: 'Duration', value: `${formatNumber(r.durationMin)} min` },
              { label: 'Fare', value: `${formatUsd(r.fareUsd)} · ${formatLbp(r.fareLbp)}` },
              { label: 'Commission', value: formatUsd(r.commissionUsd) },
              { label: 'Note', value: r.note || '—' },
            ]}
          />

          <SectionTitle>People</SectionTitle>
          <InfoGrid
            items={[
              {
                label: 'Passenger',
                value: <PersonCell name={r.passenger.name} phone={r.passenger.phone} />,
              },
              {
                label: 'Driver',
                value: r.driver ? (
                  <PersonCell
                    name={r.driver.name}
                    phone={r.driver.phone}
                    extra={
                      <Text size="xs" c="dimmed">
                        {r.driver.vehicleMake} {r.driver.vehicleModel} · {r.driver.vehicleColor} · {r.driver.plateNumber}
                      </Text>
                    }
                  />
                ) : (
                  'Not assigned'
                ),
              },
              { label: 'Passenger rated driver', value: r.ratingByPassenger ? `${r.ratingByPassenger} ★` : '—' },
              { label: 'Driver rated passenger', value: r.ratingByDriver ? `${r.ratingByDriver} ★` : '—' },
            ]}
          />

          <Divider my="xs" />
          <SectionTitle>Timeline</SectionTitle>
          <Timeline bulletSize={14} lineWidth={2} active={-1}>
            {(
              [
                ['Requested', r.requestedAt],
                ['Accepted', r.acceptedAt],
                ['Driver arrived', r.arrivedAt],
                ['Started', r.startedAt],
                ['Completed', r.completedAt],
                ['Cancelled', r.cancelledAt],
              ] as const
            )
              .filter(([, at]) => !!at)
              .map(([label, at]) => (
                <Timeline.Item key={label} title={label}>
                  <Text size="xs" c="dimmed">
                    {formatDateTime(at)}
                  </Text>
                </Timeline.Item>
              ))}
          </Timeline>
        </Stack>
      )}

      <ReasonModal
        opened={cancelOpen}
        title="Cancel ride"
        description="The passenger and driver will be notified that the ride was cancelled by an administrator."
        confirmLabel="Cancel ride"
        loading={cancel.isPending}
        onClose={() => setCancelOpen(false)}
        onConfirm={(reason) => cancel.mutate(reason)}
      />
    </Drawer>
  );
}
