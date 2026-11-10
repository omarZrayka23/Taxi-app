import { AppShell, Burger, Group, NavLink, ScrollArea, Text, ThemeIcon, Button, Divider } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconCalendarEvent,
  IconCar,
  IconCash,
  IconDashboard,
  IconLogout,
  IconMapPin,
  IconReceipt2,
  IconRoute,
  IconSettings,
  IconSteeringWheel,
  IconRoad,
  IconUsers,
  IconUserShield,
  IconCurrencyDollar,
} from '@tabler/icons-react';
import { NavLink as RouterNavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const NAV = [
  { to: '/', label: 'Dashboard', icon: IconDashboard, end: true },
  { to: '/drivers', label: 'Drivers', icon: IconSteeringWheel },
  { to: '/owners', label: 'Car owners', icon: IconUserShield },
  { to: '/listings', label: 'Rental listings', icon: IconCar },
  { to: '/rides', label: 'Rides', icon: IconRoad },
  { to: '/bookings', label: 'Rental bookings', icon: IconCalendarEvent },
  { to: '/pricing', label: 'Pricing', icon: IconCurrencyDollar },
  { to: '/places', label: 'Places', icon: IconMapPin },
  { to: '/route-fares', label: 'Route fares', icon: IconRoute },
  { to: '/billing', label: 'Billing', icon: IconReceipt2 },
  { to: '/users', label: 'Users', icon: IconUsers },
  { to: '/settings', label: 'Settings', icon: IconSettings },
];

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure();
  const { user, logout } = useAuth();
  const location = useLocation();

  const isActive = (to: string, end?: boolean) =>
    end ? location.pathname === to : location.pathname === to || location.pathname.startsWith(`${to}/`);

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="lg"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <ThemeIcon variant="filled" color="yellow" radius="md">
              <IconCash size={18} />
            </ThemeIcon>
            <Text fw={700}>Minieh Rides</Text>
            <Text c="dimmed" size="sm" visibleFrom="xs">
              Admin
            </Text>
          </Group>
          <Group gap="sm">
            <Text size="sm" c="dimmed" visibleFrom="sm">
              {user?.name}
            </Text>
            <Button variant="subtle" color="gray" size="xs" leftSection={<IconLogout size={16} />} onClick={logout}>
              Log out
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <AppShell.Section grow component={ScrollArea}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              component={RouterNavLink}
              to={item.to}
              end={item.end}
              label={item.label}
              leftSection={<item.icon size={18} stroke={1.6} />}
              active={isActive(item.to, item.end)}
              onClick={close}
              style={{ borderRadius: 'var(--mantine-radius-md)' }}
            />
          ))}
        </AppShell.Section>
        <AppShell.Section>
          <Divider my="xs" />
          <Text size="xs" c="dimmed" px="sm" pb="xs">
            Signed in as {user?.phone}
          </Text>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
