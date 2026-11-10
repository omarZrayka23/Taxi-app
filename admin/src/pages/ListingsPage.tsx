import { useState } from 'react';
import { Button, Divider, Drawer, Group, Stack, Tabs } from '@mantine/core';
import { IconBuildingStore, IconCar, IconCheck, IconX } from '@tabler/icons-react';
import { adminApi, type ReviewAction } from '../api/endpoints';
import type { ApprovalStatus, Listing } from '../api/types';
import { PaginatedTable } from '../components/DataTable';
import { listingColumns } from '../components/listingColumns';
import { StatusFilter } from '../components/Filters';
import { PageHeader, SectionTitle } from '../components/Layout';
import { ListingDetails, PhotoGrid } from '../components/ListingView';
import { ReasonModal } from '../components/ReasonModal';
import { useApiMutation } from '../lib/notify';
import { keys } from '../lib/queries';
import { PlatformCars } from './PlatformCars';

const LISTING_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const satisfies readonly ApprovalStatus[];

export default function ListingsPage() {
  const [tab, setTab] = useState<string | null>('review');
  return (
    <>
      <PageHeader title="Rental listings" description="Review cars submitted by owners and manage the platform's own fleet." />
      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="review" leftSection={<IconCar size={16} />}>
            All listings
          </Tabs.Tab>
          <Tabs.Tab value="platform" leftSection={<IconBuildingStore size={16} />}>
            Platform cars
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="review">
          <ListingReview />
        </Tabs.Panel>
        <Tabs.Panel value="platform">
          <PlatformCars />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}

function ListingReview() {
  const [status, setStatus] = useState<ApprovalStatus | null>('PENDING');
  const [selected, setSelected] = useState<Listing | null>(null);

  return (
    <>
      <Group mb="md">
        <StatusFilter options={LISTING_STATUSES} value={status} onChange={setStatus} />
      </Group>
      <PaginatedTable
        queryKey={['admin', 'listings', 'list', { status }]}
        fetchPage={(page) => adminApi.listings({ status, page })}
        columns={listingColumns}
        rowKey={(l) => l.id}
        onRowClick={setSelected}
        emptyMessage="No listings match this filter."
      />
      <ListingReviewDrawer listing={selected} onClose={() => setSelected(null)} onChanged={setSelected} />
    </>
  );
}

function ListingReviewDrawer({
  listing,
  onClose,
  onChanged,
}: {
  listing: Listing | null;
  onClose: () => void;
  onChanged: (l: Listing) => void;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const mutation = useApiMutation({
    mutationFn: ({ action, reason }: { action: ReviewAction; reason?: string }) =>
      adminApi.listingAction(listing!.id, action, reason),
    success: (_d, v) => (v.action === 'approve' ? 'Listing approved' : 'Listing rejected'),
    invalidate: [['admin', 'listings'], ['admin', 'stats'], keys.platformListings],
    onSuccess: (data) => {
      setRejectOpen(false);
      onChanged(data.listing);
    },
  });

  return (
    <Drawer opened={listing !== null} onClose={onClose} position="right" size="xl" title="Listing details">
      {listing && (
        <Stack gap="xs">
          <ListingDetails listing={listing} />
          <Group gap="xs" mt="sm">
            {listing.status !== 'APPROVED' && (
              <Button
                color="teal"
                leftSection={<IconCheck size={16} />}
                loading={mutation.isPending && mutation.variables?.action === 'approve'}
                onClick={() => mutation.mutate({ action: 'approve' })}
              >
                Approve
              </Button>
            )}
            {listing.status !== 'REJECTED' && (
              <Button color="red" variant="light" leftSection={<IconX size={16} />} onClick={() => setRejectOpen(true)}>
                Reject
              </Button>
            )}
          </Group>
          <Divider my="xs" />
          <SectionTitle>Photos</SectionTitle>
          <PhotoGrid photos={listing.photos} />
        </Stack>
      )}
      <ReasonModal
        opened={rejectOpen}
        title="Reject listing"
        description="The owner will see this reason and can edit the listing."
        confirmLabel="Reject"
        required
        loading={mutation.isPending}
        onClose={() => setRejectOpen(false)}
        onConfirm={(reason) => mutation.mutate({ action: 'reject', reason })}
      />
    </Drawer>
  );
}
