import type { ReactNode } from 'react';
import { Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <Group justify="space-between" align="flex-end" mb="md" wrap="wrap">
      <Stack gap={2}>
        <Title order={2}>{title}</Title>
        {description && (
          <Text c="dimmed" size="sm">
            {description}
          </Text>
        )}
      </Stack>
      {actions && <Group gap="sm">{actions}</Group>}
    </Group>
  );
}

export interface InfoItem {
  label: string;
  value: ReactNode;
}

/** Two-column label/value list used in detail drawers. */
export function InfoGrid({ items, cols = 2 }: { items: InfoItem[]; cols?: number }) {
  return (
    <SimpleGrid cols={{ base: 1, xs: cols }} spacing="sm" verticalSpacing="xs">
      {items.map((it) => (
        <Stack key={it.label} gap={0}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {it.label}
          </Text>
          <Text size="sm" component="div">
            {it.value ?? '—'}
          </Text>
        </Stack>
      ))}
    </SimpleGrid>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Title order={5} mt="md" mb="xs">
      {children}
    </Title>
  );
}

/** Shows `<name>` with phone underneath. */
export function PersonCell({ name, phone, extra }: { name: string; phone?: string | null; extra?: ReactNode }) {
  return (
    <Stack gap={0}>
      <Text size="sm" fw={500}>
        {name}
      </Text>
      {phone && (
        <Text size="xs" c="dimmed">
          {phone}
        </Text>
      )}
      {extra}
    </Stack>
  );
}
