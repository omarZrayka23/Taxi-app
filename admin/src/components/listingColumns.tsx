import { Avatar, Group, Stack, Text } from '@mantine/core';
import { IconPhoto } from '@tabler/icons-react';
import type { Listing } from '../api/types';
import { fileUrl } from '../config';
import { formatDate } from '../lib/format';
import type { Column } from './DataTable';
import { PersonCell } from './Layout';
import { listingPrices, listingTitle } from './ListingView';
import { StatusBadge } from './StatusBadge';

export const listingColumns: Column<Listing>[] = [
  {
    key: 'car',
    title: 'Car',
    render: (l) => (
      <Group gap="sm" wrap="nowrap">
        <Avatar src={fileUrl(l.photos[0]?.url)} radius="sm" size="md">
          <IconPhoto size={18} />
        </Avatar>
        <Stack gap={0}>
          <Text size="sm" fw={500}>
            {listingTitle(l)}
          </Text>
          <Text size="xs" c="dimmed">
            {l.place.nameEn} · {l.seats} seats · {l.transmission === 'AUTOMATIC' ? 'Auto' : 'Manual'}
          </Text>
        </Stack>
      </Group>
    ),
  },
  {
    key: 'owner',
    title: 'Owner',
    render: (l) => <PersonCell name={l.owner.businessName || l.owner.name} phone={l.owner.phone} extra={<StatusBadge value={l.owner.type} />} />,
  },
  { key: 'price', title: 'Price', render: (l) => <Text size="sm">{listingPrices(l)}</Text> },
  {
    key: 'status',
    title: 'Status',
    render: (l) => (
      <Group gap={4}>
        <StatusBadge value={l.status} />
        {!l.isActive && <StatusBadge value="INACTIVE" color="gray" />}
      </Group>
    ),
  },
  { key: 'created', title: 'Created', render: (l) => formatDate(l.createdAt) },
];
