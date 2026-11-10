import { Group, Text } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api/endpoints';
import type { BillingAccount, Subscription } from '../api/types';
import { PaginatedTable, type Column } from '../components/DataTable';
import { SearchInput, useSearch } from '../components/Filters';
import { PageHeader, PersonCell } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate, formatUsd } from '../lib/format';

export function SubscriptionCell({ subscription }: { subscription: Subscription | null }) {
  if (!subscription)
    return (
      <Text size="sm" c="dimmed">
        —
      </Text>
    );
  return (
    <Group gap={6} wrap="nowrap">
      <StatusBadge value={subscription.active ? 'ACTIVE' : 'EXPIRED'} />
      <Text size="xs" c="dimmed">
        until {formatDate(subscription.periodEnd)}
      </Text>
    </Group>
  );
}

const columns: Column<BillingAccount>[] = [
  { key: 'user', title: 'Account', render: (a) => <PersonCell name={a.user.name} phone={a.user.phone} /> },
  {
    key: 'kinds',
    title: 'Role',
    render: (a) => (
      <Group gap={4}>
        {a.kinds.map((k) => (
          <StatusBadge key={k} value={k} color={k === 'DRIVER' ? 'yellow' : 'cyan'} />
        ))}
      </Group>
    ),
  },
  { key: 'plan', title: 'Plan', render: (a) => (a.billingPlan ? <StatusBadge value={a.billingPlan} /> : '—') },
  { key: 'sub', title: 'Subscription', render: (a) => <SubscriptionCell subscription={a.subscription} /> },
  {
    key: 'balance',
    title: 'Balance owed',
    align: 'right',
    render: (a) => (
      <Text size="sm" fw={600} c={a.balanceUsd > 0 ? 'red' : a.balanceUsd < 0 ? 'teal' : undefined}>
        {formatUsd(a.balanceUsd)}
      </Text>
    ),
  },
];

export default function BillingPage() {
  const navigate = useNavigate();
  const { search, setSearch, debounced } = useSearch();

  return (
    <>
      <PageHeader
        title="Billing"
        description="Driver and owner balances. Positive balance = amount owed to the platform; negative = credit."
      />
      <Group mb="md">
        <SearchInput value={search} onChange={setSearch} />
      </Group>
      <PaginatedTable
        queryKey={['admin', 'billing', 'accounts', { search: debounced }]}
        fetchPage={(page) => adminApi.billingAccounts({ search: debounced || undefined, page })}
        columns={columns}
        rowKey={(a) => a.user.id}
        onRowClick={(a) => navigate(`/billing/${a.user.id}`)}
        emptyMessage="No billing accounts found."
      />
    </>
  );
}
