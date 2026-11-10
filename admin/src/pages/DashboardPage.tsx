import type { ReactNode } from 'react';
import { Group, Paper, SimpleGrid, Text, ThemeIcon, type MantineColor } from '@mantine/core';
import {
  IconAlertTriangle,
  IconCalendarEvent,
  IconCar,
  IconCash,
  IconSteeringWheel,
  IconRoad,
  IconUserShield,
  IconUsers,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { adminApi } from '../api/endpoints';
import { PageHeader } from '../components/Layout';
import { QueryState } from '../components/QueryState';
import { formatNumber, formatUsd } from '../lib/format';

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: ReactNode;
  color: MantineColor;
  to?: string;
}

function StatCard({ label, value, hint, icon, color, to }: StatCardProps) {
  const content = (
    <Paper withBorder radius="md" p="md" h="100%" style={to ? { cursor: 'pointer' } : undefined}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            {label}
          </Text>
          <Text fz={28} fw={700} mt={4} lh={1.2}>
            {value}
          </Text>
          {hint && (
            <Text size="sm" c="dimmed" mt={4}>
              {hint}
            </Text>
          )}
        </div>
        <ThemeIcon variant="light" color={color} size={40} radius="md">
          {icon}
        </ThemeIcon>
      </Group>
    </Paper>
  );
  return to ? (
    <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>
      {content}
    </Link>
  ) : (
    content
  );
}

export default function DashboardPage() {
  const query = useQuery({ queryKey: ['admin', 'stats'], queryFn: adminApi.stats, refetchInterval: 60_000 });

  return (
    <>
      <PageHeader title="Dashboard" description="Live overview of the platform (refreshes every minute)." />
      <QueryState query={query}>
        {(s) => (
          <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md">
            <StatCard
              label="Rides today"
              value={formatNumber(s.rides.today)}
              hint={`${formatNumber(s.rides.completedToday)} completed`}
              icon={<IconRoad size={22} />}
              color="yellow"
              to="/rides"
            />
            <StatCard
              label="Revenue today"
              value={formatUsd(s.rides.revenueTodayUsd)}
              hint="Completed ride fares"
              icon={<IconCash size={22} />}
              color="teal"
            />
            <StatCard
              label="Drivers"
              value={formatNumber(s.drivers.total)}
              hint={`${formatNumber(s.drivers.online)} online now`}
              icon={<IconSteeringWheel size={22} />}
              color="blue"
              to="/drivers"
            />
            <StatCard
              label="Drivers pending"
              value={formatNumber(s.drivers.pending)}
              hint="Waiting for approval"
              icon={<IconSteeringWheel size={22} />}
              color={s.drivers.pending > 0 ? 'orange' : 'gray'}
              to="/drivers"
            />
            <StatCard
              label="Owners pending"
              value={formatNumber(s.ownersPending)}
              hint="Car owner applications"
              icon={<IconUserShield size={22} />}
              color={s.ownersPending > 0 ? 'orange' : 'gray'}
              to="/owners"
            />
            <StatCard
              label="Listings pending"
              value={formatNumber(s.listingsPending)}
              hint="Rental cars to review"
              icon={<IconCar size={22} />}
              color={s.listingsPending > 0 ? 'orange' : 'gray'}
              to="/listings"
            />
            <StatCard
              label="Bookings"
              value={formatNumber(s.bookings.active)}
              hint={`active · ${formatNumber(s.bookings.pending)} pending`}
              icon={<IconCalendarEvent size={22} />}
              color="grape"
              to="/bookings"
            />
            <StatCard
              label="Outstanding debt"
              value={formatUsd(s.outstandingDebtUsd)}
              hint="Owed to the platform"
              icon={<IconAlertTriangle size={22} />}
              color="red"
              to="/billing"
            />
            <StatCard
              label="Users"
              value={formatNumber(s.users)}
              hint="Registered accounts"
              icon={<IconUsers size={22} />}
              color="cyan"
              to="/users"
            />
          </SimpleGrid>
        )}
      </QueryState>
    </>
  );
}
