import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../api/endpoints';

/** Shared query keys used for invalidation across pages. */
export const keys = {
  places: ['admin', 'places'] as const,
  settings: ['admin', 'settings'] as const,
  pricing: ['admin', 'pricing'] as const,
  routeFares: ['admin', 'route-fares'] as const,
  platformListings: ['owner', 'listings'] as const,
};

/** All places (including inactive). */
export function usePlaces() {
  return useQuery({ queryKey: keys.places, queryFn: async () => (await adminApi.places()).places });
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: adminApi.settings });
}
