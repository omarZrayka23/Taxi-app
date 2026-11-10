import { QueryClient, useQuery } from '@tanstack/react-query';
import { ApiError } from './client';
import { documentsApi, publicApi } from './endpoints';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return count < 2;
      },
      staleTime: 15_000,
    },
  },
});

export const qk = {
  config: ['config'] as const,
  places: ['places'] as const,
  documents: ['documents'] as const,
  currentRide: ['rides', 'current'] as const,
  ride: (id: number) => ['rides', 'detail', id] as const,
  rideHistory: ['rides', 'history'] as const,
  driverCurrentRide: ['driver', 'current-ride'] as const,
  driverOffers: ['driver', 'offers'] as const,
  driverRides: ['driver', 'rides'] as const,
  driverBilling: ['driver', 'billing'] as const,
  rentals: (filters: object) => ['rentals', 'list', filters] as const,
  rental: (id: number) => ['rentals', 'detail', id] as const,
  bookings: ['bookings', 'list'] as const,
  booking: (id: number) => ['bookings', 'detail', id] as const,
  ownerListings: ['owner', 'listings'] as const,
  ownerBookings: (status?: string) => ['owner', 'bookings', status ?? 'ALL'] as const,
};

export function useAppConfig() {
  return useQuery({ queryKey: qk.config, queryFn: publicApi.config, staleTime: 10 * 60_000 });
}

export function usePlaces() {
  return useQuery({
    queryKey: qk.places,
    queryFn: async () => (await publicApi.places()).places,
    staleTime: 10 * 60_000,
  });
}

export function useDocuments() {
  return useQuery({ queryKey: qk.documents, queryFn: async () => (await documentsApi.list()).documents });
}
