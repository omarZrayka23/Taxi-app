import { api, apiRequest } from './client';
import type {
  Gender,
  AdminDriver,
  AdminDriverDetail,
  AdminDriverListItem,
  AdminVehicleType,
  AdminOwner,
  AdminOwnerDetail,
  AdminStats,
  ApprovalStatus,
  AuthResponse,
  BillingAccount,
  BillingAccountDetail,
  Booking,
  BookingStatus,
  LedgerEntry,
  Listing,
  ListingInput,
  Page,
  PaymentMethod,
  Place,
  PlaceInput,
  Ride,
  RideStatus,
  RouteFare,
  RouteFareInput,
  Settings,
  Subscription,
  User,
  UserStatus,
  VehicleTypeInput,
} from './types';

export const PAGE_SIZE = 20;

const pageQuery = (page: number) => ({ page, pageSize: PAGE_SIZE });

// ---------- Auth ----------
export const authApi = {
  login: (phone: string, password: string) =>
    apiRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { phone, password },
      skipAuthRedirect: true,
    }),
  me: () => api.get<{ user: User }>('/auth/me'),
};

// ---------- Admin ----------
export type DriverAction = 'approve' | 'reject' | 'suspend' | 'reactivate';
export type ReviewAction = 'approve' | 'reject';

export const adminApi = {
  stats: () => api.get<AdminStats>('/admin/stats'),

  users: (params: { search?: string; page: number }) =>
    api.get<Page<User>>('/admin/users', { search: params.search, ...pageQuery(params.page) }),
  setUserStatus: (id: number, status: UserStatus) => api.patch<{ user: User }>(`/admin/users/${id}`, { status }),
  setUserGender: (id: number, gender: Gender) => api.patch<{ user: User }>(`/admin/users/${id}`, { gender }),

  drivers: (params: { status?: ApprovalStatus | null; search?: string; page: number }) =>
    api.get<Page<AdminDriverListItem>>('/admin/drivers', {
      status: params.status,
      search: params.search,
      ...pageQuery(params.page),
    }),
  driver: (id: number) => api.get<AdminDriverDetail>(`/admin/drivers/${id}`),
  driverAction: (id: number, action: DriverAction, reason?: string) =>
    api.post<{ driver: AdminDriver }>(`/admin/drivers/${id}/${action}`, reason ? { reason } : {}),

  owners: (params: { status?: ApprovalStatus | null; page: number }) =>
    api.get<Page<AdminOwner>>('/admin/owners', { status: params.status, ...pageQuery(params.page) }),
  owner: (id: number) => api.get<AdminOwnerDetail>(`/admin/owners/${id}`),
  ownerAction: (id: number, action: ReviewAction, reason?: string) =>
    api.post<{ owner: AdminOwner }>(`/admin/owners/${id}/${action}`, reason ? { reason } : {}),

  listings: (params: { status?: ApprovalStatus | null; page: number }) =>
    api.get<Page<Listing>>('/admin/listings', { status: params.status, ...pageQuery(params.page) }),
  listingAction: (id: number, action: ReviewAction, reason?: string) =>
    api.post<{ listing: Listing }>(`/admin/listings/${id}/${action}`, reason ? { reason } : {}),

  rides: (params: { status?: RideStatus | null; page: number }) =>
    api.get<Page<Ride>>('/admin/rides', { status: params.status, ...pageQuery(params.page) }),
  ride: (id: number) => api.get<{ ride: Ride }>(`/rides/${id}`),
  cancelRide: (id: number, reason?: string) =>
    api.post<{ ride: Ride }>(`/admin/rides/${id}/cancel`, reason ? { reason } : {}),

  bookings: (params: { status?: BookingStatus | null; page: number }) =>
    api.get<Page<Booking>>('/admin/bookings', { status: params.status, ...pageQuery(params.page) }),

  vehicleTypes: () => api.get<{ items: AdminVehicleType[] }>('/admin/vehicle-types'),
  createVehicleType: (body: VehicleTypeInput) => api.post<{ vehicleType: AdminVehicleType }>('/admin/vehicle-types', body),
  updateVehicleType: (code: string, body: Partial<Omit<VehicleTypeInput, 'code'>>) =>
    api.patch<{ vehicleType: AdminVehicleType }>(`/admin/vehicle-types/${code}`, body),
  deleteVehicleType: (code: string) => api.delete<{ ok: true }>(`/admin/vehicle-types/${code}`),

  places: () => api.get<{ places: Place[] }>('/admin/places'),
  createPlace: (body: PlaceInput) => api.post<{ place: Place }>('/admin/places', body),
  updatePlace: (id: number, body: Partial<PlaceInput>) => api.patch<{ place: Place }>(`/admin/places/${id}`, body),
  deletePlace: (id: number) => api.delete<{ ok: true }>(`/admin/places/${id}`),

  routeFares: () => api.get<{ items: RouteFare[] }>('/admin/route-fares'),
  createRouteFare: (body: RouteFareInput) => api.post<{ routeFare: RouteFare }>('/admin/route-fares', body),
  updateRouteFare: (id: number, body: Partial<RouteFareInput>) =>
    api.patch<{ routeFare: RouteFare }>(`/admin/route-fares/${id}`, body),
  deleteRouteFare: (id: number) => api.delete<{ ok: true }>(`/admin/route-fares/${id}`),

  settings: () => api.get<Settings>('/admin/settings'),
  updateSettings: (body: Partial<Settings>) => api.put<Settings>('/admin/settings', body),

  billingAccounts: (params: { search?: string; page: number }) =>
    api.get<Page<BillingAccount>>('/admin/billing/accounts', { search: params.search, ...pageQuery(params.page) }),
  billingAccount: (userId: number) => api.get<BillingAccountDetail>(`/admin/billing/accounts/${userId}`),
  recordPayment: (userId: number, body: { amountUsd: number; method: PaymentMethod; note?: string }) =>
    api.post<{ entry: LedgerEntry; balanceUsd: number }>(`/admin/billing/accounts/${userId}/payments`, body),
  activateSubscription: (userId: number, months: number) =>
    api.post<{ subscription: Subscription; balanceUsd: number }>(
      `/admin/billing/accounts/${userId}/subscription`,
      { months },
    ),
  addAdjustment: (userId: number, body: { amountUsd: number; note: string }) =>
    api.post<{ entry: LedgerEntry; balanceUsd: number }>(`/admin/billing/accounts/${userId}/adjustments`, body),
};

// ---------- Platform-owned cars (admin uses the /owner endpoints) ----------
export const ownerApi = {
  listings: () => api.get<{ listings: Listing[] }>('/owner/listings'),
  createListing: (body: ListingInput) => api.post<{ listing: Listing }>('/owner/listings', body),
  updateListing: (id: number, body: Partial<ListingInput>) =>
    api.patch<{ listing: Listing }>(`/owner/listings/${id}`, body),
  uploadPhotos: (id: number, files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append('photos', f));
    return api.upload<{ listing: Listing }>(`/owner/listings/${id}/photos`, form);
  },
  deletePhoto: (id: number, photoId: number) =>
    api.delete<{ listing: Listing }>(`/owner/listings/${id}/photos/${photoId}`),
  /** Bookings of platform cars are handled by the admin as their owner. */
  bookingAction: (id: number, action: OwnerBookingAction, reason?: string) =>
    api.post<{ booking: Booking }>(`/owner/bookings/${id}/${action}`, reason ? { reason } : {}),
};

export type OwnerBookingAction = 'confirm' | 'reject' | 'start' | 'complete';
