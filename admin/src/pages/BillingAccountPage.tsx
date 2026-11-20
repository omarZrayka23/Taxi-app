import { useEffect, useState } from 'react';
import {
  Anchor,
  Breadcrumbs,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAdjustments, IconCalendarPlus, IconCash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { adminApi } from '../api/endpoints';
import { PAYMENT_METHODS, type LedgerEntry, type PaymentMethod } from '../api/types';
import { DataTable, type Column } from '../components/DataTable';
import { InfoGrid, PageHeader, SectionTitle } from '../components/Layout';
import { ErrorState, LoadingState } from '../components/QueryState';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate, formatDateTime, formatUsd, humanize } from '../lib/format';
import { useApiMutation } from '../lib/notify';

const LEDGER_COLORS: Record<string, string> = {
  RIDE_COMMISSION: 'blue',
  RENTAL_COMMISSION: 'cyan',
  SUBSCRIPTION_FEE: 'violet',
  PAYMENT: 'teal',
  ADJUSTMENT: 'gray',
};

const ledgerColumns: Column<LedgerEntry>[] = [
  { key: 'date', title: 'Date', width: 160, render: (e) => formatDateTime(e.createdAt) },
  { key: 'type', title: 'Type', render: (e) => <StatusBadge value={e.type} color={LEDGER_COLORS[e.type]} /> },
  {
    key: 'desc',
    title: 'Description',
    render: (e) => (
      <Stack gap={0}>
        <Text size="sm">{e.description}</Text>
        {(e.rideId || e.bookingId) && (
          <Text size="xs" c="dimmed">
            {e.rideId ? `Ride #${e.rideId}` : `Booking #${e.bookingId}`}
          </Text>
        )}
      </Stack>
    ),
  },
  {
    key: 'amount',
    title: 'Amount',
    align: 'right',
    render: (e) => (
      <Text size="sm" fw={600} c={e.amountUsd < 0 ? 'teal' : 'red'}>
        {e.amountUsd > 0 ? '+' : ''}
        {formatUsd(e.amountUsd)}
      </Text>
    ),
  },
];

type Dialog = 'payment' | 'subscription' | 'adjustment' | null;

export default function BillingAccountPage() {
  const userId = Number(useParams().userId);
  const [dialog, setDialog] = useState<Dialog>(null);

  const query = useQuery({
    queryKey: ['admin', 'billing', 'account', userId],
    queryFn: () => adminApi.billingAccount(userId),
    enabled: Number.isFinite(userId),
  });

  const crumbs = (
    <Breadcrumbs mb="xs">
      <Anchor component={Link} to="/billing" size="sm">
        Billing
      </Anchor>
      <Text size="sm">{query.data?.user.name ?? `User #${userId}`}</Text>
    </Breadcrumbs>
  );

  if (query.isLoading) return <>{crumbs}<LoadingState /></>;
  if (query.error || !query.data)
    return (
      <>
        {crumbs}
        <ErrorState error={query.error ?? new Error('Account not found')} onRetry={() => void query.refetch()} />
      </>
    );

  const { user, balanceUsd, subscription, entries } = query.data;
  const sortedEntries = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      {crumbs}
      <PageHeader
        title={user.name}
        description={`${user.phone} · user #${user.id}`}
        actions={
          <>
            <Button leftSection={<IconCash size={16} />} color="teal" onClick={() => setDialog('payment')}>
              Record payment
            </Button>
            <Button leftSection={<IconCalendarPlus size={16} />} variant="light" onClick={() => setDialog('subscription')}>
              Activate months
            </Button>
            <Button leftSection={<IconAdjustments size={16} />} variant="default" onClick={() => setDialog('adjustment')}>
              Adjustment
            </Button>
          </>
        }
      />

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb="md">
        <Paper withBorder radius="md" p="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Balance
          </Text>
          <Text fz={32} fw={700} c={balanceUsd > 0 ? 'red' : balanceUsd < 0 ? 'teal' : undefined}>
            {formatUsd(balanceUsd)}
          </Text>
          <Text size="sm" c="dimmed">
            {balanceUsd > 0 ? 'Owed to the platform' : balanceUsd < 0 ? 'Credit in favour of the user' : 'Settled'}
          </Text>
        </Paper>
        <Paper withBorder radius="md" p="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb={6}>
            Monthly subscription
          </Text>
          {subscription ? (
            <InfoGrid
              items={[
                { label: 'Status', value: <StatusBadge value={subscription.active ? 'ACTIVE' : 'EXPIRED'} /> },
                { label: 'Period', value: `${formatDate(subscription.periodStart)} → ${formatDate(subscription.periodEnd)}` },
              ]}
            />
          ) : (
            <Text size="sm" c="dimmed">
              No subscription. Only needed for drivers on the Monthly plan.
            </Text>
          )}
        </Paper>
      </SimpleGrid>

      <SectionTitle>Ledger</SectionTitle>
      <DataTable columns={ledgerColumns} rows={sortedEntries} rowKey={(e) => e.id} emptyMessage="No ledger entries yet." />

      <PaymentModal userId={userId} opened={dialog === 'payment'} balanceUsd={balanceUsd} onClose={() => setDialog(null)} />
      <SubscriptionModal userId={userId} monthlyFeeUsd={query.data.monthlyFeeUsd} opened={dialog === 'subscription'} onClose={() => setDialog(null)} />
      <AdjustmentModal userId={userId} opened={dialog === 'adjustment'} onClose={() => setDialog(null)} />
    </>
  );
}

const accountKeys = (userId: number) => [
  ['admin', 'billing'],
  ['admin', 'drivers'],
  ['admin', 'stats'],
  ['admin', 'billing', 'account', userId],
];

interface ModalProps {
  userId: number;
  opened: boolean;
  onClose: () => void;
}

function PaymentModal({ userId, opened, onClose, balanceUsd }: ModalProps & { balanceUsd: number }) {
  const form = useForm<{ amountUsd: number | string; method: PaymentMethod; note: string }>({
    initialValues: { amountUsd: '', method: 'CASH', note: '' },
    validate: { amountUsd: (v) => (v !== '' && Number(v) > 0 ? null : 'Enter an amount greater than 0') },
  });

  useEffect(() => {
    if (opened) form.setValues({ amountUsd: balanceUsd > 0 ? Number(balanceUsd.toFixed(2)) : '', method: 'CASH', note: '' });
  }, [opened]);

  const save = useApiMutation({
    mutationFn: (v: { amountUsd: number; method: PaymentMethod; note?: string }) => adminApi.recordPayment(userId, v),
    success: (d) => `Payment recorded. New balance ${formatUsd(d.balanceUsd)}`,
    invalidate: accountKeys(userId),
    onSuccess: onClose,
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Record payment" centered>
      <form
        onSubmit={form.onSubmit((v) =>
          save.mutate({ amountUsd: Number(v.amountUsd), method: v.method, note: v.note.trim() || undefined }),
        )}
      >
        <Stack>
          <NumberInput label="Amount received" prefix="$" min={0} decimalScale={2} withAsterisk data-autofocus {...form.getInputProps('amountUsd')} />
          <Select
            label="Method"
            data={PAYMENT_METHODS.map((m) => ({ value: m, label: m === 'WHISH' || m === 'OMT' ? m : humanize(m) }))}
            allowDeselect={false}
            {...form.getInputProps('method')}
          />
          <Textarea label="Note" placeholder="Optional reference" autosize minRows={2} {...form.getInputProps('note')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" color="teal" loading={save.isPending}>
              Record payment
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function SubscriptionModal({ userId, monthlyFeeUsd, opened, onClose }: ModalProps & { monthlyFeeUsd: number | null }) {
  const [months, setMonths] = useState<number | string>(1);

  useEffect(() => {
    if (opened) setMonths(1);
  }, [opened]);

  const save = useApiMutation({
    mutationFn: (m: number) => adminApi.activateSubscription(userId, m),
    success: (d) => `Subscription active until ${formatDate(d.subscription.periodEnd)}. Balance ${formatUsd(d.balanceUsd)}`,
    invalidate: accountKeys(userId),
    onSuccess: onClose,
  });

  const n = Number(months);
  const valid = Number.isInteger(n) && n >= 1 && n <= 12;

  return (
    <Modal opened={opened} onClose={onClose} title="Activate subscription months" centered>
      <Stack>
        <Text size="sm" c="dimmed">
          Charges months × the monthly fee to the balance and extends the subscription period.
          {monthlyFeeUsd !== null && ` Monthly fee: ${formatUsd(monthlyFeeUsd)}.`}
        </Text>
        <SegmentedControl
          data={['1', '2', '3', '6', '12']}
          value={String(months)}
          onChange={(v) => setMonths(Number(v))}
        />
        <NumberInput
          label="Months"
          min={1}
          max={12}
          allowDecimal={false}
          value={months}
          onChange={setMonths}
          error={!valid ? 'Between 1 and 12' : undefined}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate(n)}>
            Activate {valid ? `${n} month${n === 1 ? '' : 's'}` : ''}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function AdjustmentModal({ userId, opened, onClose }: ModalProps) {
  const form = useForm<{ direction: 'charge' | 'credit'; amountUsd: number | string; note: string }>({
    initialValues: { direction: 'credit', amountUsd: '', note: '' },
    validate: {
      amountUsd: (v) => (v !== '' && Number(v) > 0 ? null : 'Enter an amount greater than 0'),
      note: (v) => (v.trim() ? null : 'A note is required for adjustments'),
    },
  });

  useEffect(() => {
    if (opened) form.reset();
  }, [opened]);

  const save = useApiMutation({
    mutationFn: (v: { amountUsd: number; note: string }) => adminApi.addAdjustment(userId, v),
    success: (d) => `Adjustment saved. New balance ${formatUsd(d.balanceUsd)}`,
    invalidate: accountKeys(userId),
    onSuccess: onClose,
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Balance adjustment" centered>
      <form
        onSubmit={form.onSubmit((v) => {
          const amount = Math.abs(Number(v.amountUsd));
          save.mutate({ amountUsd: v.direction === 'charge' ? amount : -amount, note: v.note.trim() });
        })}
      >
        <Stack>
          <SegmentedControl
            data={[
              { value: 'credit', label: 'Credit (reduce what they owe)' },
              { value: 'charge', label: 'Charge (increase what they owe)' },
            ]}
            {...form.getInputProps('direction')}
          />
          <NumberInput label="Amount" prefix="$" min={0} decimalScale={2} withAsterisk {...form.getInputProps('amountUsd')} />
          <Textarea label="Note" placeholder="Why is this adjustment made?" withAsterisk autosize minRows={2} {...form.getInputProps('note')} />
          <Text size="xs" c="dimmed">
            Will be sent as amountUsd ={' '}
            {form.values.amountUsd === ''
              ? '—'
              : formatUsd((form.values.direction === 'charge' ? 1 : -1) * Math.abs(Number(form.values.amountUsd)))}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Save adjustment
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
