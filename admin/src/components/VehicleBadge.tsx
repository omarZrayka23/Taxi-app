import { Badge, type MantineColor } from '@mantine/core';
import type { VehicleIcon } from '../api/types';
import { useVehicleTypes } from '../lib/queries';

const ICON_COLORS: Record<VehicleIcon, MantineColor> = {
  CAR: 'yellow',
  TUKTUK: 'grape',
  MOTORCYCLE: 'orange',
  VAN: 'cyan',
  BUS: 'indigo',
};

/** Vehicle type badge: English name, coloured by icon. Shows the raw code until types load. */
export function VehicleBadge({
  code,
  vehicle,
}: {
  code: string | null | undefined;
  vehicle?: { nameEn: string; icon: string };
}) {
  const { data } = useVehicleTypes();
  if (!code) return null;
  const type = vehicle ?? data?.find((t) => t.code === code);
  return (
    <Badge color={type ? ICON_COLORS[type.icon as VehicleIcon] : 'gray'} variant="light" radius="sm">
      {type?.nameEn ?? code}
    </Badge>
  );
}
