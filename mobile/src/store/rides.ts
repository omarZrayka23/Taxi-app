import { create } from 'zustand';
import type { DriverLocationEvent, Ride } from '@/api/types';

export interface Offer {
  ride: Ride;
  expiresAt: string | null;
}

interface RideState {
  /** Ride shown on the passenger home screen (active, or just finished and awaiting acknowledgment/rating). */
  passengerRide: Ride | null;
  /** Latest live position of the assigned driver (passenger side). */
  driverLocation: DriverLocationEvent | null;
  /** Ride offers for the driver. */
  offers: Offer[];
  /** Whether the realtime socket is connected. */
  socketConnected: boolean;

  setPassengerRide: (ride: Ride | null) => void;
  setDriverLocation: (loc: DriverLocationEvent | null) => void;
  upsertOffer: (offer: Offer) => void;
  setOffers: (offers: Offer[]) => void;
  removeOffer: (rideId: number) => void;
  setSocketConnected: (v: boolean) => void;
  reset: () => void;
}

export const useRideStore = create<RideState>()((set, get) => ({
  passengerRide: null,
  driverLocation: null,
  offers: [],
  socketConnected: false,

  setPassengerRide: (ride) => {
    const prev = get().passengerRide;
    // drop the live driver marker when ride changes
    if (!ride || !prev || prev.id !== ride.id) set({ driverLocation: null });
    set({ passengerRide: ride });
  },
  setDriverLocation: (loc) => set({ driverLocation: loc }),
  upsertOffer: (offer) => set((s) => ({ offers: [offer, ...s.offers.filter((o) => o.ride.id !== offer.ride.id)] })),
  setOffers: (offers) =>
    set((s) => {
      // keep expiresAt we may know from the socket
      const known = new Map(s.offers.map((o) => [o.ride.id, o.expiresAt]));
      return { offers: offers.map((o) => ({ ...o, expiresAt: o.expiresAt ?? known.get(o.ride.id) ?? null })) };
    }),
  removeOffer: (rideId) => set((s) => ({ offers: s.offers.filter((o) => o.ride.id !== rideId) })),
  setSocketConnected: (v) => set({ socketConnected: v }),
  reset: () => set({ passengerRide: null, driverLocation: null, offers: [] }),
}));
