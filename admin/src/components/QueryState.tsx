import type { ReactNode } from 'react';
import { Alert, Button, Center, Loader, Stack, Text } from '@mantine/core';
import { IconAlertCircle, IconInbox } from '@tabler/icons-react';
import { errorMessage } from '../api/client';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <Center py="xl">
      <Stack align="center" gap="xs">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          {label}
        </Text>
      </Stack>
    </Center>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Alert color="red" icon={<IconAlertCircle size={18} />} title="Could not load data" my="sm">
      <Stack gap="xs" align="flex-start">
        <Text size="sm">{errorMessage(error)}</Text>
        {onRetry && (
          <Button size="xs" variant="light" color="red" onClick={onRetry}>
            Retry
          </Button>
        )}
      </Stack>
    </Alert>
  );
}

export function EmptyState({ message = 'Nothing here yet.' }: { message?: ReactNode }) {
  return (
    <Center py="xl">
      <Stack align="center" gap={4}>
        <IconInbox size={28} color="var(--mantine-color-dimmed)" />
        <Text size="sm" c="dimmed">
          {message}
        </Text>
      </Stack>
    </Center>
  );
}

interface QueryStateProps<T> {
  query: { data: T | undefined; isLoading: boolean; error: unknown; refetch: () => unknown };
  children: (data: T) => ReactNode;
}

/** Renders loading / error states and calls children with data when available. */
export function QueryState<T>({ query, children }: QueryStateProps<T>) {
  if (query.isLoading) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data === undefined) return <EmptyState />;
  return <>{children(query.data)}</>;
}
