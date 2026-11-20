import { Button, Group, Select, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconCircleCheck, IconLock } from '@tabler/icons-react';
import { adminApi } from '../api/endpoints';
import type { Gender, User, UserStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PaginatedTable, type Column } from '../components/DataTable';
import { SearchInput, useSearch } from '../components/Filters';
import { PageHeader, PersonCell } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate } from '../lib/format';
import { useApiMutation } from '../lib/notify';

const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Man' },
  { value: 'FEMALE', label: 'Woman' },
];

export default function UsersPage() {
  const { user: me } = useAuth();
  const { search, setSearch, debounced } = useSearch();

  const setStatus = useApiMutation({
    mutationFn: (v: { user: User; status: UserStatus }) => adminApi.setUserStatus(v.user.id, v.status),
    success: (d) => `${d.user.name} is now ${d.user.status === 'BLOCKED' ? 'blocked' : 'active'}`,
    invalidate: [['admin', 'users'], ['admin', 'stats']],
  });

  const setGender = useApiMutation({
    mutationFn: (v: { user: User; gender: Gender }) => adminApi.setUserGender(v.user.id, v.gender),
    success: (d) => `${d.user.name} is now set as ${d.user.gender === 'FEMALE' ? 'woman' : 'man'}`,
    invalidate: [['admin', 'users'], ['admin', 'drivers']],
  });

  const confirmBlock = (u: User) =>
    modals.openConfirmModal({
      title: `Block ${u.name}?`,
      children: (
        <Text size="sm">
          Blocked users cannot sign in or use the app (as passenger, driver or owner) until unblocked.
        </Text>
      ),
      labels: { confirm: 'Block user', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => setStatus.mutate({ user: u, status: 'BLOCKED' }),
    });

  const columns: Column<User>[] = [
    {
      key: 'name',
      title: 'User',
      render: (u) => (
        <PersonCell
          name={u.name}
          phone={u.phone}
          extra={
            u.email ? (
              <Text size="xs" c="dimmed">
                {u.email}
              </Text>
            ) : null
          }
        />
      ),
    },
    {
      key: 'roles',
      title: 'Role',
      render: (u) => (
        <Group gap={4}>
          <StatusBadge value={u.role} />
          {u.driverProfile && <StatusBadge value="DRIVER" color="yellow" />}
          {u.ownerProfile && <StatusBadge value="OWNER" color="cyan" />}
        </Group>
      ),
    },
    {
      key: 'verified',
      title: 'Phone verified',
      render: (u) => (u.phoneVerified ? 'Yes' : <Text size="sm" c="dimmed">No</Text>),
    },
    {
      key: 'gender',
      title: 'Gender',
      render: (u) => (
        <Select
          size="xs"
          w={110}
          placeholder="Not set"
          data={GENDER_OPTIONS}
          value={u.gender}
          allowDeselect={false}
          disabled={setGender.isPending && setGender.variables?.user.id === u.id}
          onChange={(v) => v && v !== u.gender && setGender.mutate({ user: u, gender: v as Gender })}
        />
      ),
    },
    { key: 'lang', title: 'Language', render: (u) => u.language.toUpperCase() },
    { key: 'status', title: 'Status', render: (u) => <StatusBadge value={u.status} /> },
    { key: 'joined', title: 'Joined', render: (u) => formatDate(u.createdAt) },
    {
      key: 'actions',
      title: '',
      align: 'right',
      render: (u) => {
        if (u.id === me?.id) return <Text size="xs" c="dimmed">You</Text>;
        const busy = setStatus.isPending && setStatus.variables?.user.id === u.id;
        return u.status === 'BLOCKED' ? (
          <Button
            size="xs"
            variant="light"
            color="teal"
            leftSection={<IconCircleCheck size={14} />}
            loading={busy}
            onClick={() => setStatus.mutate({ user: u, status: 'ACTIVE' })}
          >
            Unblock
          </Button>
        ) : (
          <Button
            size="xs"
            variant="light"
            color="red"
            leftSection={<IconLock size={14} />}
            loading={busy}
            onClick={() => confirmBlock(u)}
          >
            Block
          </Button>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader title="Users" description="Everyone registered on Cedra." />
      <Group mb="md">
        <SearchInput value={search} onChange={setSearch} />
      </Group>
      <PaginatedTable
        queryKey={['admin', 'users', { search: debounced }]}
        fetchPage={(page) => adminApi.users({ search: debounced || undefined, page })}
        columns={columns}
        rowKey={(u) => u.id}
        emptyMessage="No users found."
      />
    </>
  );
}
