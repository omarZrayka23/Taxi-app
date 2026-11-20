import { Badge, type MantineColor } from '@mantine/core';
import { humanize } from '../lib/format';

const COLORS: Record<string, MantineColor> = {
  // approval
  PENDING: 'yellow',
  APPROVED: 'teal',
  REJECTED: 'red',
  SUSPENDED: 'orange',
  // user
  ACTIVE: 'teal',
  BLOCKED: 'red',
  // rides
  REQUESTED: 'yellow',
  ACCEPTED: 'blue',
  ARRIVED: 'indigo',
  IN_PROGRESS: 'cyan',
  COMPLETED: 'teal',
  CANCELLED: 'gray',
  EXPIRED: 'gray',
  // bookings
  CONFIRMED: 'blue',
  // misc
  CALCULATED: 'blue',
  FIXED_ROUTE: 'violet',
  COMMISSION: 'blue',
  MONTHLY: 'violet',
  ADMIN: 'dark',
  USER: 'gray',
  PLATFORM: 'dark',
  INDIVIDUAL: 'gray',
  AGENCY: 'cyan',
};

export function StatusBadge({ value, color }: { value: string | null | undefined; color?: MantineColor }) {
  if (!value) return null;
  return (
    <Badge color={color ?? COLORS[value] ?? 'gray'} variant="light" radius="sm">
      {humanize(value)}
    </Badge>
  );
}
