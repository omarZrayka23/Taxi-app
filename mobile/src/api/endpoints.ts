import { appendFile, http } from './client';
import type {
  AppConfig,
  Booking,
  BookingStatus,
  Document,
  DocumentType,
  DriverApplyInput,
  DriverBilling,
  DriverProfile,
  Gender,
  Language,
  LatLng,
  Listing,
  ListingInput,
  OwnerProfile,
  OwnerType,
  Page,
  PickedFile,
  Place,
  RentalMode,
  RentalQuote,
  Ride,
  RideEstimate,
  Transmission,
  User,
  VehicleType,
} from './types';

export interface AuthResponse {
  token: string;
  user: User;
}

// ---------- Auth & profile ----------
export const authApi = {
  register: (body: { name: string; phone: string; password: string; gender: Gender; language?: Language }) =>
    http.post<AuthResponse>('/auth/register', body),
  login: (body: { phone: string; password: string }) => http.post<AuthResponse>('/auth/login', body),
  requestOtp: () => http.post<{ sent: boolean; devCode?: string }>('/auth/otp/request'),
  verifyOtp: (code: string) => http.post<{ user: User }>('/auth/otp/verify', { code }),
  me: () => http.get<{ user: User }>('/auth/me'),
  updateMe: (body: { name?: string; email?: string; language?: Language; expoPushToken?: string | null }) =>
    http.patch<{ user: User }>('/me', body),
};

// ---------- Public config ----------
export const publicApi = {
  config: () => http.get<AppConfig>('/config'),
  places: () => http.get<{ places: Place[] }>('/places'),
};

// ---------- Documents ----------
export const documentsApi = {
  list: () => http.get<{ documents: Document[] }>('/documents'),
  upload: (type: DocumentType, file: PickedFile) => {
    const form = new FormData();
    form.append('type', type);
    appendFile(form, 'file', file);
    return http.upload<{ document: Document }>('/documents', form);
  },
};

// ---------- Rides (passenger) ----------
export interface RideRequestInput {
  vehicleType: VehicleType;
  pickup: LatLng & { address: string };
  dropoff: LatLng & { address: string };
  note?: string;
  driverGender?: Gender;
}

export const ridesApi = {
  estimate: (pickup: LatLng, dropoff: LatLng) =>
    http.post<{ estimates: RideEstimate[]; hasWomenDrivers: boolean }>('/rides/estimate', { pickup, dropoff }),
  request: (body: RideRequestInput) => http.post<{ ride: Ride }>('/rides', body),
  current: () => http.get<{ ride: Ride | null }>('/rides/current'),
  list: (page: number, pageSize = 20) => http.get<Page<Ride>>('/rides', { page, pageSize }),
  get: (id: number) => http.get<{ ride: Ride }>(`/rides/${id}`),
  cancel: (id: number, reason?: string) => http.post<{ ride: Ride }>(`/rides/${id}/cancel`, { reason }),
  rate: (id: number, stars: number) => http.post<{ ride: Ride }>(`/rides/${id}/rate`, { stars }),
  // driver actions
  accept: (id: number) => http.post<{ ride: Ride }>(`/rides/${id}/accept`),
  arrived: (id: number) => http.post<{ ride: Ride }>(`/rides/${id}/arrived`),
  start: (id: number) => http.post<{ ride: Ride }>(`/rides/${id}/start`),
  complete: (id: number) => http.post<{ ride: Ride }>(`/rides/${id}/complete`),
};

// ---------- Driver ----------
export const driverApi = {
  apply: (body: DriverApplyInput) => http.post<{ driverProfile: DriverProfile }>('/driver/apply', body),
  updateProfile: (body: { billingPlan?: DriverApplyInput['billingPlan']; vehicleColor?: string }) =>
    http.patch<{ driverProfile: DriverProfile }>('/driver/profile', body),
  online: (pos: LatLng) => http.post<{ driverProfile: DriverProfile }>('/driver/online', pos),
  offline: () => http.post<{ driverProfile: DriverProfile }>('/driver/offline'),
  location: (pos: LatLng) => http.post<{ ok: boolean }>('/driver/location', pos),
  currentRide: () => http.get<{ ride: Ride | null }>('/driver/current-ride'),
  offers: () => http.get<{ rides: Ride[] }>('/driver/offers'),
  rides: (page: number, pageSize = 20) => http.get<Page<Ride>>('/driver/rides', { page, pageSize }),
  billing: () => http.get<DriverBilling>('/driver/billing'),
};

// ---------- Rentals (renter) ----------
export interface RentalFilters {
  placeId?: number;
  startDate?: string;
  endDate?: string;
  mode?: RentalMode;
  seats?: number;
  transmission?: Transmission;
}

export const rentalsApi = {
  list: (filters: RentalFilters, page: number, pageSize = 20) =>
    http.get<Page<Listing>>('/rentals', { ...filters, page, pageSize }),
  get: (id: number) =>
    http.get<{ listing: Listing; unavailable: { startDate: string; endDate: string }[] }>(`/rentals/${id}`),
  quote: (id: number, body: { startDate: string; endDate: string; mode: RentalMode }) =>
    http.post<RentalQuote>(`/rentals/${id}/quote`, body),
  book: (id: number, body: { startDate: string; endDate: string; mode: RentalMode; note?: string }) =>
    http.post<{ booking: Booking }>(`/rentals/${id}/book`, body),
  bookings: (page: number, pageSize = 20) => http.get<Page<Booking>>('/bookings', { page, pageSize }),
  booking: (id: number) => http.get<{ booking: Booking }>(`/bookings/${id}`),
  cancelBooking: (id: number, reason?: string) => http.post<{ booking: Booking }>(`/bookings/${id}/cancel`, { reason }),
};

// ---------- Owner ----------
export const ownerApi = {
  apply: (body: { type: Exclude<OwnerType, 'PLATFORM'>; businessName?: string }) =>
    http.post<{ ownerProfile: OwnerProfile }>('/owner/apply', body),
  listings: () => http.get<{ listings: Listing[] }>('/owner/listings'),
  createListing: (body: ListingInput) => http.post<{ listing: Listing }>('/owner/listings', body),
  updateListing: (id: number, body: Partial<ListingInput>) =>
    http.patch<{ listing: Listing }>(`/owner/listings/${id}`, body),
  uploadPhotos: (id: number, files: PickedFile[]) => {
    const form = new FormData();
    files.forEach((f) => appendFile(form, 'photos', f));
    return http.upload<{ listing: Listing }>(`/owner/listings/${id}/photos`, form);
  },
  deletePhoto: (id: number, photoId: number) =>
    http.delete<{ listing: Listing }>(`/owner/listings/${id}/photos/${photoId}`),
  bookings: (page: number, status?: BookingStatus, pageSize = 20) =>
    http.get<Page<Booking>>('/owner/bookings', { page, pageSize, status }),
  confirm: (id: number) => http.post<{ booking: Booking }>(`/owner/bookings/${id}/confirm`),
  reject: (id: number, reason?: string) => http.post<{ booking: Booking }>(`/owner/bookings/${id}/reject`, { reason }),
  start: (id: number) => http.post<{ booking: Booking }>(`/owner/bookings/${id}/start`),
  complete: (id: number) => http.post<{ booking: Booking }>(`/owner/bookings/${id}/complete`),
};
