import { useState, type ReactNode } from 'react';
import { Group, LoadingOverlay, Pagination, Paper, ScrollArea, Table, Text } from '@mantine/core';
import { keepPreviousData, useQuery, type QueryKey } from '@tanstack/react-query';
import type { Page } from '../api/types';
import { EmptyState, ErrorState, LoadingState } from './QueryState';

export interface Column<T> {
  key: string;
  title: ReactNode;
  render: (row: T) => ReactNode;
  width?: number | string;
  align?: 'left' | 'right' | 'center';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  emptyMessage?: ReactNode;
  fetching?: boolean;
  footer?: ReactNode;
}

/** Plain table with consistent styling and an empty state. */
export function DataTable<T>({ columns, rows, rowKey, onRowClick, emptyMessage, fetching, footer }: DataTableProps<T>) {
  return (
    <Paper withBorder radius="md" pos="relative">
      <LoadingOverlay visible={!!fetching} overlayProps={{ blur: 1 }} loaderProps={{ size: 'sm' }} />
      <ScrollArea>
        <Table highlightOnHover={!!onRowClick} verticalSpacing="sm" horizontalSpacing="md" miw={700}>
          <Table.Thead>
            <Table.Tr>
              {columns.map((c) => (
                <Table.Th key={c.key} w={c.width} style={{ textAlign: c.align ?? 'left', whiteSpace: 'nowrap' }}>
                  {c.title}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {columns.map((c) => (
                  <Table.Td key={c.key} style={{ textAlign: c.align ?? 'left' }}>
                    {c.render(row)}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      {rows.length === 0 && <EmptyState message={emptyMessage} />}
      {footer}
    </Paper>
  );
}

interface PaginatedTableProps<T> extends Omit<DataTableProps<T>, 'rows' | 'fetching' | 'footer'> {
  /** Base key; include all filters in it. The page number is appended automatically. */
  queryKey: QueryKey;
  fetchPage: (page: number) => Promise<Page<T>>;
}

/** Table backed by a paginated endpoint (`{ items, total, page, pageSize }`). */
export function PaginatedTable<T>({ queryKey, fetchPage, ...tableProps }: PaginatedTableProps<T>) {
  const keyString = JSON.stringify(queryKey);
  // The page is remembered per filter combination, so changing filters starts again at page 1.
  const [pageState, setPageState] = useState({ key: keyString, page: 1 });
  const page = pageState.key === keyString ? pageState.page : 1;
  const setPage = (p: number) => setPageState({ key: keyString, page: p });

  const query = useQuery({
    queryKey: [...queryKey, { page }],
    queryFn: () => fetchPage(page),
    placeholderData: keepPreviousData,
  });

  if (query.isLoading) return <LoadingState />;
  if (query.error && !query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const data = query.data;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize || 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <DataTable
      {...tableProps}
      rows={items}
      fetching={query.isFetching && query.isPlaceholderData}
      footer={
        <Group justify="space-between" px="md" py="sm" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          <Text size="sm" c="dimmed">
            {total === 0
              ? 'No results'
              : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
          </Text>
          {totalPages > 1 && <Pagination size="sm" total={totalPages} value={page} onChange={setPage} />}
        </Group>
      }
    />
  );
}
