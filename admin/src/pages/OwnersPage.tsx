import { useState } from 'react';
import { Button, Divider, Drawer, Group, Stack, Text } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { adminApi, type ReviewAction } from '../api/endpoints';
import type { AdminOwner, ApprovalStatus } from '../api/types';
import { PaginatedTable, type Column } from '../components/DataTable';
import { DocumentsGrid } from '../components/Documents';
import { StatusFilter } from '../components/Filters';
import { InfoGrid, PageHeader, PersonCell, SectionTitle } from '../components/Layout';
import { QueryState } from '../components/QueryState';
import { ReasonModal } from '../components/ReasonModal';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate, formatDateTime } from '../lib/format';
import { useApiMutation } from '../lib/notify';

const OWNER_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const satisfies readonly ApprovalStatus[];

const columns: Column<AdminOwner>[] = [
  { key: 'name', title: 'Owner', render: (o) => <PersonCell name={o.user.name} phone={o.user.phone} /> },
  { key: 'type', title: 'Type', render: (o) => <StatusBadge value={o.type} /> },
  { key: 'business', title: 'Business name', render: (o) => o.businessName ?? '—' },
  { key: 'status', title: 'Status', render: (o) => <StatusBadge value={o.status} /> },
  { key: 'created', title: 'Applied', render: (o) => formatDate(o.createdAt) },
];

export default function OwnersPage() {
  const [status, setStatus] = useState<ApprovalStatus | null>('PENDING');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <>
      <PageHeader title="Car owners" description="Individuals and agencies who rent out cars on the platform." />
      <Group mb="md">
        <StatusFilter options={OWNER_STATUSES} value={status} onChange={setStatus} />
      </Group>
      <PaginatedTable
        queryKey={['admin', 'owners', 'list', { status }]}
        fetchPage={(page) => adminApi.owners({ status, page })}
        columns={columns}
        rowKey={(o) => o.id}
        onRowClick={(o) => setSelectedId(o.id)}
        emptyMessage="No car owners match this filter."
      />
      <OwnerDrawer ownerId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}

function OwnerDrawer({ ownerId, onClose }: { ownerId: number | null; onClose: () => void }) {
  const [rejectOpen, setRejectOpen] = useState(false);

  const query = useQuery({
    queryKey: ['admin', 'owners', 'detail', ownerId],
    queryFn: () => adminApi.owner(ownerId!),
    enabled: ownerId !== null,
  });

  const mutation = useApiMutation({
    mutationFn: ({ action, reason }: { action: ReviewAction; reason?: string }) =>
      adminApi.ownerAction(ownerId!, action, reason),
    success: (_d, v) => (v.action === 'approve' ? 'Owner approved' : 'Owner rejected'),
    invalidate: [['admin', 'owners'], ['admin', 'stats']],
    onSuccess: () => setRejectOpen(false),
  });

  return (
    <Drawer opened={ownerId !== null} onClose={onClose} position="right" size="xl" title="Car owner details">
      <QueryState query={query}>
        {({ owner, documents }) => (
          <Stack gap="xs">
            <Group justify="space-between" align="flex-start">
              <PersonCell name={owner.user.name} phone={owner.user.phone} />
              <StatusBadge value={owner.status} />
            </Group>
            {owner.rejectionReason && owner.status === 'REJECTED' && (
              <Text size="sm" c="red">
                Reason: {owner.rejectionReason}
              </Text>
            )}
            {owner.type !== 'PLATFORM' && (
              <Group gap="xs" mt="xs">
                {owner.status !== 'APPROVED' && (
                  <Button
                    color="teal"
                    leftSection={<IconCheck size={16} />}
                    loading={mutation.isPending && mutation.variables?.action === 'approve'}
                    onClick={() => mutation.mutate({ action: 'approve' })}
                  >
                    Approve
                  </Button>
                )}
                {owner.status !== 'REJECTED' && (
                  <Button color="red" variant="light" leftSection={<IconX size={16} />} onClick={() => setRejectOpen(true)}>
                    Reject
                  </Button>
                )}
              </Group>
            )}
            <Divider my="xs" />
            <SectionTitle>Profile</SectionTitle>
            <InfoGrid
              items={[
                { label: 'Owner profile ID', value: `#${owner.id}` },
                { label: 'User ID', value: `#${owner.userId}` },
                { label: 'Type', value: <StatusBadge value={owner.type} /> },
                { label: 'Business name', value: owner.businessName ?? '—' },
                { label: 'Applied', value: formatDateTime(owner.createdAt) },
              ]}
            />
            <SectionTitle>Documents</SectionTitle>
            <DocumentsGrid documents={documents} />
          </Stack>
        )}
      </QueryState>
      <ReasonModal
        opened={rejectOpen}
        title="Reject car owner"
        description="The owner will not be able to publish listings."
        confirmLabel="Reject"
        required
        loading={mutation.isPending}
        onClose={() => setRejectOpen(false)}
        onConfirm={(reason) => mutation.mutate({ action: 'reject', reason })}
      />
    </Drawer>
  );
}
