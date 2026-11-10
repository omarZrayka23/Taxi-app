import { io, type Socket } from 'socket.io-client';
import { SERVER_URL } from '@/config';
import { queryClient, qk } from '@/api/queries';
import {
  isRideActive,
  type Booking,
  type DriverLocationEvent,
  type Ride,
  type RideOfferEvent,
  type User,
} from '@/api/types';
import { useAuth } from '@/store/auth';
import { useRideStore } from '@/store/rides';

let socket: Socket | null = null;
let currentToken: string | null = null;

/** Apply a ride snapshot (from socket or REST) to the caches/stores. */
export function applyRideUpdate(ride: Ride) {
  const me = useAuth.getState().user;
  queryClient.setQueryData(qk.ride(ride.id), ride);
  const store = useRideStore.getState();

  if (me && ride.passenger?.id === me.id) {
    queryClient.setQueryData(qk.currentRide, isRideActive(ride.status) ? ride : null);
    const shown = store.passengerRide;
    if (isRideActive(ride.status) || (shown && shown.id === ride.id)) store.setPassengerRide(ride);
    if (!isRideActive(ride.status)) void queryClient.invalidateQueries({ queryKey: qk.rideHistory });
  }
  if (me && ride.driver?.id === me.id) {
    queryClient.setQueryData(qk.driverCurrentRide, isRideActive(ride.status) ? ride : null);
    if (!isRideActive(ride.status)) {
      void queryClient.invalidateQueries({ queryKey: qk.driverRides });
      void queryClient.invalidateQueries({ queryKey: qk.driverBilling });
    }
  }
  if (ride.status !== 'REQUESTED') store.removeOffer(ride.id);
}

export function applyBookingUpdate(booking: Booking) {
  queryClient.setQueryData(qk.booking(booking.id), booking);
  void queryClient.invalidateQueries({ queryKey: qk.bookings });
  void queryClient.invalidateQueries({ queryKey: ['owner', 'bookings'] });
}

function resyncAfterReconnect() {
  void queryClient.invalidateQueries({ queryKey: qk.currentRide });
  void queryClient.invalidateQueries({ queryKey: qk.driverCurrentRide });
  void queryClient.invalidateQueries({ queryKey: qk.driverOffers });
  void queryClient.invalidateQueries({ queryKey: ['rides', 'detail'] });
  void queryClient.invalidateQueries({ queryKey: ['bookings'] });
  void queryClient.invalidateQueries({ queryKey: ['owner', 'bookings'] });
}

export function connectSocket(token: string) {
  if (socket && currentToken === token) return socket;
  disconnectSocket();
  currentToken = token;
  const s = io(SERVER_URL, {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
  socket = s;
  const rides = useRideStore.getState;

  s.on('connect', () => {
    rides().setSocketConnected(true);
    resyncAfterReconnect();
  });
  s.on('disconnect', () => rides().setSocketConnected(false));
  s.on('connect_error', () => rides().setSocketConnected(false));

  s.on('ride:update', (p: { ride: Ride }) => p?.ride && applyRideUpdate(p.ride));
  s.on('ride:offer', (p: RideOfferEvent) => {
    if (p?.ride) rides().upsertOffer({ ride: p.ride, expiresAt: p.expiresAt ?? null });
  });
  s.on('ride:offer:closed', (p: { rideId: number }) => {
    if (p?.rideId != null) rides().removeOffer(p.rideId);
    void queryClient.invalidateQueries({ queryKey: qk.driverOffers });
  });
  s.on('driver:location', (p: DriverLocationEvent) => {
    if (p && typeof p.lat === 'number') rides().setDriverLocation(p);
  });
  s.on('booking:update', (p: { booking: Booking }) => p?.booking && applyBookingUpdate(p.booking));
  s.on('account:update', (p: { user: User }) => {
    if (p?.user) useAuth.getState().setUser(p.user);
  });
  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = null;
  currentToken = null;
  useRideStore.getState().setSocketConnected(false);
}

/** Send the driver's position. Returns false when the socket is not connected. */
export function emitDriverLocation(lat: number, lng: number): boolean {
  if (socket?.connected) {
    socket.emit('driver:location', { lat, lng });
    return true;
  }
  return false;
}
