import { Linking } from 'react-native';

export function callPhone(phone: string | null | undefined) {
  if (!phone) return;
  void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`).catch(() => undefined);
}

export function openNavigation(lat: number, lng: number) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  void Linking.openURL(url).catch(() => undefined);
}
