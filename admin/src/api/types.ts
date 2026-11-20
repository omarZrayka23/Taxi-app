// Types mirroring docs/API.md (Cedra API contract v1).

// ---------- Enums ----------
export const USER_ROLES = ['USER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'BLOCKED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const LANGUAGES = ['ar', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
export type Gender = 'MALE' | 'FEMALE';

export const VEHICLE_TYPES = ['TAXI', 'TUKTUK'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const PRICING_MODES = ['CALCULATED', 'FIXED_ROUTE'] as const;
export type PricingMode = (typeof PRICING_MODES)[number];

/** SUSPENDED applies to drivers only. */
export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const BILLING_PLANS = ['COMMISSION', 'MONTHLY'] as const;
export type BillingPlan = (typeof BILLING_PLANS)[number];

export const DOCUMENT_TYPES = [
  'ID_CARD',
  'DRIVER_LICENSE',
  'CAR_REGISTRATION',
  'INSURANCE',
  'VEHICLE_PHOTO',
  'BUSINESS_LICENSE',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const RIDE_STATUSES = [
  'REQUESTED',
  'ACCEPTED',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];
export const ACTIVE_RIDE_STATUSES: readonly RideStatus[] = ['REQUESTED', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'];

export const CANCELLED_BY = ['PASSENGER', 'DRIVER', 'ADMIN', 'SYSTEM'] as const;
export type CancelledBy = (typeof CANCELLED_BY)[number];

export const OWNER_TYPES = ['INDIVIDUAL', 'AGENCY', 'PLATFORM'] as const;
export type OwnerType = (typeof OWNER_TYPES)[number];

export const TRANSMISSIONS = ['AUTOMATIC', 'MANUAL'] as const;
export type Transmission = (typeof TRANSMISSIONS)[number];

export const FUEL_TYPES = ['GASOLINE', 'DIESEL', 'HYBRID', 'ELECTRIC'] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const RENTAL_MODES = ['SELF_DRIVE', 'WITH_DRIVER'] as const;
export type RentalMode = (typeof RENTAL_MODES)[number];

export const BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'REJECTED', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const LEDGER_TYPES = [
  'RIDE_COMMISSION',
  'RENTAL_COMMISSION',
  'SUBSCRIPTION_FEE',
  'PAYMENT',
  'ADJUSTMENT',
] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

export const PAYMENT_METHODS = ['CASH', 'WHISH', 'OMT', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// ---------- Common ----------
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** Minimal user reference embedded in other objects. */
export interface UserRef {
  id: number;
  name: string;
  phone: string;
}

// ---------- Objects ----------
export interface DriverProfile {
  id: number;
  userId: number;
  vehicleType: VehicleType;
  vehicleMake: string;
  vehicleModel: string;
  vehicleColor: string;
  plateNumber: string;
  licenseNumber: string;
  status: ApprovalStatus;
  rejectionReason: string | null;
  billingPlan: BillingPlan;
  isOnline: boolean;
  lat: number | null;
  lng: number | null;
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
}

export interface OwnerProfile {
  id: number;
  userId: number;
  type: OwnerType;
  businessName: string | null;
  status: ApprovalStatus;
  rejectionReason: string | null;
  createdAt: string;
}

export interface User {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  role: UserRole;
  gender: Gender | null;
  language: Language;
  phoneVerified: boolean;
  status: UserStatus;
  createdAt: string;
  driverProfile: DriverProfile | null;
  ownerProfile: OwnerProfile | null;
}

export interface Document {
  id: number;
  userId: number;
  type: DocumentType;
  url: string;
  createdAt: string;
}

export interface Place {
  id: number;
  nameEn: string;
  nameAr: string;
  lat: number;
  lng: number;
  radiusKm: number;
  active: boolean;
}

export interface RideDriver {
  /** userId */
  id: number;
  name: string;
  phone: string;
  vehicleType: VehicleType;
  vehicleMake: string;
  vehicleModel: string;
  vehicleColor: string;
  plateNumber: string;
  ratingAvg: number;
  lat: number | null;
  lng: number | null;
}

export interface Ride {
  id: number;
  status: RideStatus;
  vehicleType: VehicleType;
  pricingMode: PricingMode;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffAddress: string;
  distanceKm: number;
  durationMin: number;
  fareUsd: number;
  fareLbp: number;
  note: string | null;
  passenger: UserRef;
  driver: RideDriver | null;
  requestedAt: string;
  acceptedAt: string | null;
  arrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: CancelledBy | null;
  cancelReason: string | null;
  ratingByPassenger: number | null;
  ratingByDriver: number | null;
  commissionUsd: number;
}

export interface Photo {
  id: number;
  url: string;
}

export interface Listing {
  id: number;
  /** owner.id is the owner's userId */
  owner: { id: number; name: string; phone: string; type: OwnerType; businessName: string | null };
  make: string;
  model: string;
  year: number;
  seats: number;
  transmission: Transmission;
  fuelType: FuelType;
  color: string;
  place: { id: number; nameEn: string; nameAr: string };
  description: string | null;
  selfDrive: boolean;
  pricePerDayUsd: number | null;
  withDriver: boolean;
  withDriverPricePerDayUsd: number | null;
  depositUsd: number;
  minDays: number;
  photos: Photo[];
  status: ApprovalStatus;
  rejectionReason: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Booking {
  id: number;
  listing: { id: number; make: string; model: string; year: number; photoUrl: string | null };
  renter: UserRef;
  owner: UserRef & { businessName: string | null };
  startDate: string;
  /** Return date, exclusive. */
  endDate: string;
  days: number;
  mode: RentalMode;
  pricePerDayUsd: number;
  totalUsd: number;
  totalLbp: number;
  depositUsd: number;
  commissionUsd: number;
  status: BookingStatus;
  note: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

/** amountUsd > 0 = user owes platform; < 0 = payment received. */
export interface LedgerEntry {
  id: number;
  userId: number;
  type: LedgerType;
  amountUsd: number;
  description: string;
  rideId: number | null;
  bookingId: number | null;
  createdAt: string;
}

export interface Subscription {
  id: number;
  userId: number;
  periodStart: string;
  periodEnd: string;
  active: boolean;
}

export interface VehiclePricing {
  type: VehicleType;
  mode: PricingMode;
  baseFare: number;
  perKm: number;
  perMin: number;
  minimumFare: number;
}

export interface RouteFare {
  id: number;
  fromPlace: Place;
  toPlace: Place;
  vehicleType: VehicleType;
  priceUsd: number;
  bidirectional: boolean;
}

export interface Settings {
  commissionPercent: number;
  rentalCommissionPercent: number;
  monthlyFeeTaxiUsd: number;
  monthlyFeeTuktukUsd: number;
  lbpRate: number;
  maxDebtUsd: number;
  searchRadiusKm: number;
  offerTimeoutSec: number;
  fareRoundingUsd: number;
  supportPhone: string;
}

// ---------- Auth ----------
export interface AuthResponse {
  token: string;
  user: User;
}

// ---------- Admin response shapes ----------
export interface AdminStats {
  users: number;
  drivers: { total: number; pending: number; online: number };
  ownersPending: number;
  listingsPending: number;
  rides: { today: number; completedToday: number; revenueTodayUsd: number };
  bookings: { pending: number; active: number };
  outstandingDebtUsd: number;
}

/** The embedded user is at least {id,name,phone}; the backend may include more User fields. */
export type EmbeddedUser = UserRef & Partial<Omit<User, 'id' | 'name' | 'phone' | 'driverProfile' | 'ownerProfile'>>;

export type AdminDriverListItem = DriverProfile & { user: UserRef & { gender: Gender | null }; balanceUsd: number };

export type AdminDriver = DriverProfile & { user: EmbeddedUser };

export interface AdminDriverDetail {
  driver: AdminDriver;
  documents: Document[];
  balanceUsd: number;
  subscription: Subscription | null;
}

export type AdminOwner = OwnerProfile & { user: EmbeddedUser };

export interface AdminOwnerDetail {
  owner: AdminOwner;
  documents: Document[];
}

export type AccountKind = 'DRIVER' | 'OWNER';

export interface BillingAccount {
  user: UserRef;
  kinds: AccountKind[];
  billingPlan: BillingPlan | null;
  balanceUsd: number;
  subscription: Subscription | null;
}

export interface BillingAccountDetail {
  user: EmbeddedUser;
  balanceUsd: number;
  subscription: Subscription | null;
  entries: LedgerEntry[];
}

// ---------- Request bodies ----------
export interface ListingInput {
  make: string;
  model: string;
  year: number;
  seats: number;
  transmission: Transmission;
  fuelType: FuelType;
  color: string;
  placeId: number;
  description?: string;
  selfDrive: boolean;
  pricePerDayUsd?: number | null;
  withDriver: boolean;
  withDriverPricePerDayUsd?: number | null;
  depositUsd: number;
  minDays: number;
  isActive?: boolean;
}

export interface PlaceInput {
  nameEn: string;
  nameAr: string;
  lat: number;
  lng: number;
  radiusKm: number;
  active?: boolean;
}

export interface RouteFareInput {
  fromPlaceId: number;
  toPlaceId: number;
  vehicleType: VehicleType;
  priceUsd: number;
  bidirectional: boolean;
}

export type PricingInput = Omit<VehiclePricing, 'type'>;
