import { Anchor, Card, Image, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconFileTypePdf } from '@tabler/icons-react';
import type { Document } from '../api/types';
import { fileUrl } from '../config';
import { formatDateTime, humanize } from '../lib/format';
import { EmptyState } from './QueryState';

function isPdf(url: string) {
  return /\.pdf($|\?)/i.test(url);
}

/** Grid of uploaded documents: image thumbnails (click to open full size) or PDF links. */
export function DocumentsGrid({ documents }: { documents: Document[] }) {
  if (!documents.length) return <EmptyState message="No documents uploaded." />;
  return (
    <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
      {documents.map((doc) => {
        const href = fileUrl(doc.url);
        return (
          <Card key={doc.id} withBorder padding="xs" radius="md">
            <Card.Section>
              <Anchor href={href} target="_blank" rel="noreferrer">
                {!isPdf(doc.url) ? (
                  <Image src={href} h={110} fit="cover" alt={doc.type} fallbackSrc="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />
                ) : (
                  <Stack h={110} align="center" justify="center" gap={4} bg="var(--mantine-color-gray-light)">
                    <IconFileTypePdf size={36} />
                    <Text size="xs">Open PDF</Text>
                  </Stack>
                )}
              </Anchor>
            </Card.Section>
            <Text size="sm" fw={500} mt="xs">
              {humanize(doc.type)}
            </Text>
            <Text size="xs" c="dimmed">
              {formatDateTime(doc.createdAt)}
            </Text>
          </Card>
        );
      })}
    </SimpleGrid>
  );
}
