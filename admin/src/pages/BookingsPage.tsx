import { useState } from 'react';
import { Avatar, Button, Drawer, Group, Paper, Stack, Text } from '@mantine/core';
import { IconCar } from '@tabler/icons-react';
import { adminApi, ownerApi, type OwnerBookingAction } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { ReasonModal } from '../components/ReasonModal';
import { useApiMutation } from '../lib/notify';
import { BOOKING_STATUSES, type Booking, type BookingStatus } from '../api/types';
import { fileUrl } from '../config';
import { PaginatedTable, type Column } from '../components/DataTable';
import { StatusFilter } from '../components/Filters';
import { InfoGrid, PageHeader, PersonCell, SectionTitle } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate, formatDateTime, formatLbp, formatUsd, humanize } from '../lib/format';

function CarCell({ b }: { b: Booking }) {
  return (
    <Group gap="sm" wrap="nowrap">
      <Avatar src={fileUrl(b.listing.photoUrl)} radius="sm">
        <IconCar size={18} />
      </Avatar>
      <Stack gap={0}>
        <Text size="sm" fw={500}>
          {b.listing.make} {b.listing.model} {b.listing.year}
        </Text>
        <Text size="xs" c="dimmed">
          Listing #{b.listing.id}
        </Text>
      </Stack>
    </Group>
  );
}

const columns: Column<Booking>[] = [
  { key: 'id', title: '#', width: 70, render: (b) => <Text size="sm" c="dimmed">#{b.id}</Text> },
  { key: 'car', title: 'Car', render: (b) => <CarCell b={b} /> },
  { key: 'renter', title: 'Renter', render: (b) => <PersonCell name={b.renter.name} phone={b.renter.phone} /> },
  {
    key: 'owner',
    title: 'Owner',
    render: (b) => <PersonCell name={b.owner.businessName || b.owner.name} phone={b.owner.phone} />,
  },
  {
    key: 'dates',
    title: 'Dates',
    render: (b) => (
      <Stack gap={0}>
        <Text size="sm">
          {formatDate(b.startDate)} → {formatDate(b.endDate)}
        </Text>
        <Text size="xs" c="dimmed">
          {b.days} day{b.days === 1 ? '' : 's'} · {humanize(b.mode)}
        </Text>
      </Stack>
    ),
  },
  { key: 'total', title: 'Total', align: 'right', render: (b) => <Text size="sm" fw={500}>{formatUsd(b.totalUsd)}</Text> },
  { key: 'status', title: 'Status', render: (b) => <StatusBadge value={b.status} /> },
];

/**
 * Platform cars are owned by the admin account, so the admin acts as the owner for their
 * bookings via the /owner/bookings endpoints. Booking.owner.id is the owner's userId.
 */
function PlatformBookingActions({ booking, onChanged }: { booking: Booking; onChanged: (b: Booking) => void }) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const mutation = useApiMutation({
    mutationFn: ({ action, reason }: { action: OwnerBookingAction; reason?: string }) =>
      ownerApi.bookingAction(booking.id, action, reason),
    success: (_d, v) =>
      ({ confirm: 'Booking confirmed', reject: 'Booking rejected', start: 'Car handed over', complete: 'Booking completed' })[
        v.action
      ],
    invalidate: [['admin', 'bookings'], ['admin', 'stats']],
    onSuccess: (d) => {
      setRejectOpen(false);
      onChanged(d.booking);
    },
  });
  const loading = (a: OwnerBookingAction) => mutation.isPending && mutation.variables?.action === a;
  const s = booking.status;
  if (!['PENDING', 'CONFIRMED', 'ACTIVE'].includes(s)) return null;

  return (
    <Paper withBorder p="sm" radius="md" mt="xs">
      <Text size="sm" fw={600} mb={6}>
        Platform car — you are the owner
      </Text>
      <Group gap="xs">
        {s === 'PENDING' && (
          <Button size="xs" color="teal" loading={loading('confirm')} onClick={() => mutation.mutate({ action: 'confirm' })}>
            Confirm
          </Button>
        )}
        {(s === 'PENDING' || s === 'CONFIRMED') && (
          <Button size="xs" color="red" variant="light" onClick={() => setRejectOpen(true)}>
            Reject
          </Button>
        )}
        {s === 'CONFIRMED' && (
          <Button size="xs" loading={loading('start')} onClick={() => mutation.mutate({ action: 'start' })}>
            Car handed over (start)
          </Button>
        )}
        {s === 'ACTIVE' && (
          <Button size="xs" color="teal" loading={loading('complete')} onClick={() => mutation.mutate({ action: 'complete' })}>
            Car returned (complete)
          </Button>
        )}
      </Group>
      <ReasonModal
        opened={rejectOpen}
        title="Reject booking"
        confirmLabel="Reject booking"
        loading={mutation.isPending}
        onClose={() => setRejectOpen(false)}
        onConfirm={(reason) => mutation.mutate({ action: 'reject', reason: reason || undefined })}
      />
    </Paper>
  );
}

export default function BookingsPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<BookingStatus | null>(null);
  const [selected, setSelected] = useState<Booking | null>(null);
  const isPlatformCar = (b: Booking) => !!user && b.owner.id === user.id;

  return (
    <>
      <PageHeader
        title="Rental bookings"
        description="Owners confirm and hand over their own cars. For platform cars you act as the owner from the booking panel."
      />
      <Group mb="md">
        <StatusFilter options={BOOKING_STATUSES} value={status} onChange={setStatus} />
      </Group>
      <PaginatedTable
        queryKey={['admin', 'bookings', 'list', { status }]}
        fetchPage={(page) => adminApi.bookings({ status, page })}
        columns={columns}
        rowKey={(b) => b.id}
        onRowClick={setSelected}
        emptyMessage="No bookings match this filter."
      />
      <Drawer
        opened={selected !== null}
        onClose={() => setSelected(null)}
        position="right"
        size="lg"
        title={`Booking #${selected?.id ?? ''}`}
      >
        {selected && (
          <Stack gap="xs">
            <Group justify="space-between">
              <CarCell b={selected} />
              <StatusBadge value={selected.status} />
            </Group>
            {selected.rejectionReason && (
              <Text size="sm" c="red">
                Reason: {selected.rejectionReason}
              </Text>
            )}
            {isPlatformCar(selected) && <PlatformBookingActions booking={selected} onChanged={setSelected} />}
            <SectionTitle>Rental</SectionTitle>
            <InfoGrid
              items={[
                { label: 'Pick-up date', value: formatDate(selected.startDate) },
                { label: 'Return date', value: formatDate(selected.endDate) },
                { label: 'Days', value: selected.days },
                { label: 'Mode', value: humanize(selected.mode) },
                { label: 'Price / day', value: formatUsd(selected.pricePerDayUsd) },
                { label: 'Total', value: `${formatUsd(selected.totalUsd)} · ${formatLbp(selected.totalLbp)}` },
                { label: 'Deposit (in person)', value: formatUsd(selected.depositUsd) },
                { label: 'Commission', value: formatUsd(selected.commissionUsd) },
                { label: 'Created', value: formatDateTime(selected.createdAt) },
                { label: 'Note', value: selected.note || '—' },
              ]}
            />
            <SectionTitle>People</SectionTitle>
            <InfoGrid
              items={[
                { label: 'Renter', value: <PersonCell name={selected.renter.name} phone={selected.renter.phone} /> },
                {
                  label: 'Owner',
                  value: (
                    <PersonCell
                      name={selected.owner.name}
                      phone={selected.owner.phone}
                      extra={selected.owner.businessName && <Text size="xs">{selected.owner.businessName}</Text>}
                    />
                  ),
                },
              ]}
            />
          </Stack>
        )}
      </Drawer>
    </>
  );
}
