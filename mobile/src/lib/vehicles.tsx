import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { VehicleIcon, VehicleSummary } from '@/api/types';

export function vehicleName(v: VehicleSummary, lang: string): string {
  return lang === 'ar' ? v.nameAr : v.nameEn;
}

const GLYPHS: Record<VehicleIcon, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  CAR: 'car',
  TUKTUK: 'rickshaw',
  MOTORCYCLE: 'motorbike',
  VAN: 'van-passenger',
  BUS: 'bus',
};

export function VehicleIconView({ icon, size = 24, color }: { icon: VehicleIcon; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={GLYPHS[icon] ?? 'car'} size={size} color={color} />;
}
