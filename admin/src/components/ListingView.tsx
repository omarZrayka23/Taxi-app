import { ActionIcon, Anchor, Group, Image, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import type { Listing, Photo } from '../api/types';
import { fileUrl } from '../config';
import { formatDateTime, formatUsd, humanize } from '../lib/format';
import { InfoGrid, PersonCell, SectionTitle } from './Layout';
import { EmptyState } from './QueryState';
import { StatusBadge } from './StatusBadge';

export function listingTitle(l: Pick<Listing, 'make' | 'model' | 'year'>) {
  return `${l.make} ${l.model} ${l.year}`;
}

export function listingPrices(l: Listing) {
  const parts: string[] = [];
  if (l.selfDrive) parts.push(`${formatUsd(l.pricePerDayUsd)}/day self-drive`);
  if (l.withDriver) parts.push(`${formatUsd(l.withDriverPricePerDayUsd)}/day with driver`);
  return parts.length ? parts.join(' · ') : '—';
}

export function PhotoGrid({
  photos,
  onDelete,
  deletingId,
}: {
  photos: Photo[];
  onDelete?: (photo: Photo) => void;
  deletingId?: number | null;
}) {
  if (!photos.length) return <EmptyState message="No photos." />;
  return (
    <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
      {photos.map((p) => (
        <div key={p.id} style={{ position: 'relative' }}>
          <Anchor href={fileUrl(p.url)} target="_blank" rel="noreferrer">
            <Image src={fileUrl(p.url)} h={120} radius="sm" fit="cover" alt="Car photo" />
          </Anchor>
          {onDelete && (
            <Tooltip label="Delete photo">
              <ActionIcon
                color="red"
                variant="filled"
                size="sm"
                pos="absolute"
                top={6}
                right={6}
                loading={deletingId === p.id}
                onClick={() => onDelete(p)}
                aria-label="Delete photo"
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </div>
      ))}
    </SimpleGrid>
  );
}

/** Read-only listing details (owner, car, pricing). Photos are rendered by the caller. */
export function ListingDetails({ listing }: { listing: Listing }) {
  const l = listing;
  return (
    <Stack gap="xs">
      <Group justify="space-between" align="flex-start">
        <Stack gap={0}>
          <Text fw={700} size="lg">
            {listingTitle(l)}
          </Text>
          <Text size="sm" c="dimmed">
            Listing #{l.id} · created {formatDateTime(l.createdAt)}
          </Text>
        </Stack>
        <Group gap={6}>
          <StatusBadge value={l.status} />
          {!l.isActive && <StatusBadge value="INACTIVE" color="gray" />}
        </Group>
      </Group>
      {l.rejectionReason && l.status === 'REJECTED' && (
        <Text size="sm" c="red">
          Reason: {l.rejectionReason}
        </Text>
      )}

      <SectionTitle>Owner</SectionTitle>
      <Group gap="sm">
        <PersonCell name={l.owner.name} phone={l.owner.phone} extra={l.owner.businessName && <Text size="xs">{l.owner.businessName}</Text>} />
        <StatusBadge value={l.owner.type} />
      </Group>

      <SectionTitle>Car</SectionTitle>
      <InfoGrid
        cols={3}
        items={[
          { label: 'Year', value: l.year },
          { label: 'Seats', value: l.seats },
          { label: 'Color', value: l.color },
          { label: 'Transmission', value: humanize(l.transmission) },
          { label: 'Fuel', value: humanize(l.fuelType) },
          { label: 'Location', value: `${l.place.nameEn} · ${l.place.nameAr}` },
        ]}
      />
      {l.description && (
        <Text size="sm" mt="xs" style={{ whiteSpace: 'pre-wrap' }}>
          {l.description}
        </Text>
      )}

      <SectionTitle>Pricing</SectionTitle>
      <InfoGrid
        cols={3}
        items={[
          { label: 'Self-drive', value: l.selfDrive ? `${formatUsd(l.pricePerDayUsd)} / day` : 'Not offered' },
          { label: 'With driver', value: l.withDriver ? `${formatUsd(l.withDriverPricePerDayUsd)} / day` : 'Not offered' },
          { label: 'Deposit', value: formatUsd(l.depositUsd) },
          { label: 'Minimum days', value: l.minDays },
          { label: 'Visible to renters', value: l.isActive ? 'Yes' : 'No (inactive)' },
        ]}
      />
    </Stack>
  );
}
