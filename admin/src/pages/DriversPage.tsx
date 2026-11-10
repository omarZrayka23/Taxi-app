import { useState } from 'react';
import { Anchor, Badge, Button, Divider, Drawer, Group, Stack, Text } from '@mantine/core';
import { IconCheck, IconPlayerPause, IconPlayerPlay, IconX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { adminApi, type DriverAction } from '../api/endpoints';
import { APPROVAL_STATUSES, type AdminDriverListItem, type ApprovalStatus, type Subscription } from '../api/types';
import { PaginatedTable, type Column } from '../components/DataTable';
import { DocumentsGrid } from '../components/Documents';
import { SearchInput, StatusFilter, useSearch } from '../components/Filters';
import { InfoGrid, PageHeader, PersonCell, SectionTitle } from '../components/Layout';
import { QueryState } from '../components/QueryState';
import { ReasonModal } from '../components/ReasonModal';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate, formatDateTime, formatUsd } from '../lib/format';
import { useApiMutation } from '../lib/notify';

const columns: Column<AdminDriverListItem>[] = [
  { key: 'name', title: 'Driver', render: (d) => <PersonCell name={d.user.name} phone={d.user.phone} /> },
  {
    key: 'vehicle',
    title: 'Vehicle',
    render: (d) => (
      <Stack gap={2}>
        <Group gap={6}>
          <StatusBadge value={d.vehicleType} />
          <Text size="sm">
            {d.vehicleMake} {d.vehicleModel}
          </Text>
        </Group>
        <Text size="xs" c="dimmed">
          {d.vehicleColor} · {d.plateNumber}
        </Text>
      </Stack>
    ),
  },
  { key: 'plan', title: 'Plan', render: (d) => <StatusBadge value={d.billingPlan} /> },
  { key: 'status', title: 'Status', render: (d) => <StatusBadge value={d.status} /> },
  {
    key: 'online',
    title: 'Online',
    render: (d) =>
      d.isOnline ? (
        <Badge color="green" variant="dot">
          Online
        </Badge>
      ) : (
        <Text size="sm" c="dimmed">
          Offline
        </Text>
      ),
  },
  {
    key: 'balance',
    title: 'Balance',
    align: 'right',
    render: (d) => (
      <Text size="sm" fw={500} c={d.balanceUsd > 0 ? 'red' : undefined}>
        {formatUsd(d.balanceUsd)}
      </Text>
    ),
  },
  { key: 'created', title: 'Applied', render: (d) => formatDate(d.createdAt) },
];

export default function DriversPage() {
  const [status, setStatus] = useState<ApprovalStatus | null>('PENDING');
  const { search, setSearch, debounced } = useSearch();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <>
      <PageHeader title="Drivers" description="Review driver applications and manage driver accounts." />
      <Group mb="md" justify="space-between" wrap="wrap">
        <StatusFilter options={APPROVAL_STATUSES} value={status} onChange={setStatus} />
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, phone or plate…" />
      </Group>
      <PaginatedTable
        queryKey={['admin', 'drivers', 'list', { status, search: debounced }]}
        fetchPage={(page) => adminApi.drivers({ status, search: debounced || undefined, page })}
        columns={columns}
        rowKey={(d) => d.id}
        onRowClick={(d) => setSelectedId(d.id)}
        emptyMessage="No drivers match these filters."
      />
      <DriverDrawer driverId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}

function SubscriptionText({ subscription }: { subscription: Subscription | null }) {
  if (!subscription) return <Text size="sm">None</Text>;
  return (
    <Group gap={6}>
      <StatusBadge value={subscription.active ? 'ACTIVE' : 'EXPIRED'} />
      <Text size="sm">
        {formatDate(subscription.periodStart)} → {formatDate(subscription.periodEnd)}
      </Text>
    </Group>
  );
}

type ReasonAction = Extract<DriverAction, 'reject' | 'suspend'>;

function DriverDrawer({ driverId, onClose }: { driverId: number | null; onClose: () => void }) {
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'drivers', 'detail', driverId],
    queryFn: () => adminApi.driver(driverId!),
    enabled: driverId !== null,
  });

  const mutation = useApiMutation({
    mutationFn: ({ action, reason }: { action: DriverAction; reason?: string }) =>
      adminApi.driverAction(driverId!, action, reason),
    success: (_d, v) =>
      ({ approve: 'Driver approved', reject: 'Driver rejected', suspend: 'Driver suspended', reactivate: 'Driver reactivated' })[
        v.action
      ],
    invalidate: [['admin', 'drivers'], ['admin', 'stats']],
    onSuccess: () => setReasonAction(null),
  });

  return (
    <Drawer opened={driverId !== null} onClose={onClose} position="right" size="xl" title="Driver details">
      <QueryState query={query}>
        {({ driver, documents, balanceUsd, subscription }) => {
          const s = driver.status;
          return (
            <Stack gap="xs">
              <Group justify="space-between" align="flex-start">
                <PersonCell name={driver.user.name} phone={driver.user.phone} />
                <StatusBadge value={s} />
              </Group>
              {driver.rejectionReason && (s === 'REJECTED' || s === 'SUSPENDED') && (
                <Text size="sm" c="red">
                  Reason: {driver.rejectionReason}
                </Text>
              )}

              <Group gap="xs" mt="xs">
                {(s === 'PENDING' || s === 'REJECTED') && (
                  <Button
                    color="teal"
                    leftSection={<IconCheck size={16} />}
                    loading={mutation.isPending && mutation.variables?.action === 'approve'}
                    onClick={() => mutation.mutate({ action: 'approve' })}
                  >
                    Approve
                  </Button>
                )}
                {s === 'PENDING' && (
                  <Button color="red" variant="light" leftSection={<IconX size={16} />} onClick={() => setReasonAction('reject')}>
                    Reject
                  </Button>
                )}
                {s === 'APPROVED' && (
                  <Button
                    color="orange"
                    variant="light"
                    leftSection={<IconPlayerPause size={16} />}
                    onClick={() => setReasonAction('suspend')}
                  >
                    Suspend
                  </Button>
                )}
                {s === 'SUSPENDED' && (
                  <Button
                    color="teal"
                    leftSection={<IconPlayerPlay size={16} />}
                    loading={mutation.isPending && mutation.variables?.action === 'reactivate'}
                    onClick={() => mutation.mutate({ action: 'reactivate' })}
                  >
                    Reactivate
                  </Button>
                )}
              </Group>

              <Divider my="xs" />
              <SectionTitle>Profile</SectionTitle>
              <InfoGrid
                items={[
                  { label: 'Driver profile ID', value: `#${driver.id}` },
                  { label: 'User ID', value: `#${driver.userId}` },
                  { label: 'Applied', value: formatDateTime(driver.createdAt) },
                  { label: 'License number', value: driver.licenseNumber },
                  {
                    label: 'Rating',
                    value: driver.ratingCount ? `${driver.ratingAvg.toFixed(1)} ★ (${driver.ratingCount})` : 'No ratings',
                  },
                  { label: 'Online', value: driver.isOnline ? 'Yes' : 'No' },
                ]}
              />

              <SectionTitle>Vehicle</SectionTitle>
              <InfoGrid
                items={[
                  { label: 'Type', value: <StatusBadge value={driver.vehicleType} /> },
                  { label: 'Make / model', value: `${driver.vehicleMake} ${driver.vehicleModel}` },
                  { label: 'Color', value: driver.vehicleColor },
                  { label: 'Plate', value: driver.plateNumber },
                ]}
              />

              <SectionTitle>Billing</SectionTitle>
              <InfoGrid
                items={[
                  { label: 'Plan', value: <StatusBadge value={driver.billingPlan} /> },
                  {
                    label: 'Balance (owed)',
                    value: (
                      <Text size="sm" fw={600} c={balanceUsd > 0 ? 'red' : undefined}>
                        {formatUsd(balanceUsd)}
                      </Text>
                    ),
                  },
                  { label: 'Subscription', value: <SubscriptionText subscription={subscription} /> },
                  {
                    label: 'Ledger',
                    value: (
                      <Anchor component={Link} to={`/billing/${driver.userId}`} size="sm">
                        Open billing account →
                      </Anchor>
                    ),
                  },
                ]}
              />

              <SectionTitle>Documents</SectionTitle>
              <DocumentsGrid documents={documents} />
            </Stack>
          );
        }}
      </QueryState>

      <ReasonModal
        opened={reasonAction !== null}
        title={reasonAction === 'suspend' ? 'Suspend driver' : 'Reject driver application'}
        description={
          reasonAction === 'suspend'
            ? 'The driver will be taken offline and cannot accept rides until reactivated.'
            : 'The driver can correct the information and apply again.'
        }
        confirmLabel={reasonAction === 'suspend' ? 'Suspend' : 'Reject'}
        confirmColor={reasonAction === 'suspend' ? 'orange' : 'red'}
        required
        loading={mutation.isPending}
        onClose={() => setReasonAction(null)}
        onConfirm={(reason) => reasonAction && mutation.mutate({ action: reasonAction, reason })}
      />
    </Drawer>
  );
}
