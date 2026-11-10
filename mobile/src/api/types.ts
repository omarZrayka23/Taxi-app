// Types mirror docs/API.md (contract v1).

export type UserRole = 'USER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'BLOCKED';
export type Language = 'ar' | 'en';
export type VehicleType = 'TAXI' | 'TUKTUK';
export type PricingMode = 'CALCULATED' | 'FIXED_ROUTE';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type BillingPlan = 'COMMISSION' | 'MONTHLY';
export type DocumentType =
  | 'ID_CARD'
  | 'DRIVER_LICENSE'
  | 'CAR_REGISTRATION'
  | 'INSURANCE'
  | 'VEHICLE_PHOTO'
  | 'BUSINESS_LICENSE';
export type RideStatus = 'REQUESTED' | 'ACCEPTED' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
export type CancelledBy = 'PASSENGER' | 'DRIVER' | 'ADMIN' | 'SYSTEM';
export type OwnerType = 'INDIVIDUAL' | 'AGENCY' | 'PLATFORM';
export type Transmission = 'AUTOMATIC' | 'MANUAL';
export type FuelType = 'GASOLINE' | 'DIESEL' | 'HYBRID' | 'ELECTRIC';
export type RentalMode = 'SELF_DRIVE' | 'WITH_DRIVER';
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type LedgerType = 'RIDE_COMMISSION' | 'RENTAL_COMMISSION' | 'SUBSCRIPTION_FEE' | 'PAYMENT' | 'ADJUSTMENT';

export const ACTIVE_RIDE_STATUSES: RideStatus[] = ['REQUESTED', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'];
export const isRideActive = (s: RideStatus) => ACTIVE_RIDE_STATUSES.includes(s);

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

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RideDriver {
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
  passenger: { id: number; name: string; phone: string };
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

export interface RideEstimate {
  vehicleType: VehicleType;
  fareUsd: number;
  fareLbp: number;
  pricingMode: PricingMode;
  distanceKm: number;
  durationMin: number;
  fromPlace: Place | null;
  toPlace: Place | null;
}

export interface Listing {
  id: number;
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
  photos: { id: number; url: string }[];
  status: ApprovalStatus;
  rejectionReason: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Booking {
  id: number;
  listing: { id: number; make: string; model: string; year: number; photoUrl: string | null };
  renter: { id: number; name: string; phone: string };
  owner: { id: number; name: string; phone: string; businessName: string | null };
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

export interface VehicleTypeConfig {
  type: VehicleType;
  mode: PricingMode;
  baseFare: number;
  perKm: number;
  perMin: number;
  minimumFare: number;
}

export interface AppConfig {
  lbpRate: number;
  commissionPercent: number;
  rentalCommissionPercent: number;
  monthlyFeeTaxiUsd: number;
  monthlyFeeTuktukUsd: number;
  supportPhone: string;
  vehicleTypes: VehicleTypeConfig[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DriverBilling {
  balanceUsd: number;
  billingPlan: BillingPlan;
  subscription: Subscription | null;
  ledger: LedgerEntry[];
  commissionPercent: number;
  monthlyFeeUsd: number;
  maxDebtUsd: number;
}

export interface RentalQuote {
  days: number;
  pricePerDayUsd: number;
  totalUsd: number;
  totalLbp: number;
  depositUsd: number;
}

export interface DriverApplyInput {
  vehicleType: VehicleType;
  vehicleMake: string;
  vehicleModel: string;
  vehicleColor: string;
  plateNumber: string;
  licenseNumber: string;
  billingPlan: BillingPlan;
}

export interface ListingInput {
  make: string;
  model: string;
  year: number;
  seats: number;
  transmission: Transmission;
  fuelType: FuelType;
  color: string;
  placeId: number;
  description?: string | null;
  selfDrive: boolean;
  pricePerDayUsd?: number | null;
  withDriver: boolean;
  withDriverPricePerDayUsd?: number | null;
  depositUsd: number;
  minDays: number;
  isActive?: boolean;
}

/** Local file chosen with image/document picker. */
export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

// Socket payloads
export interface RideOfferEvent {
  ride: Ride;
  expiresAt: string;
}
export interface DriverLocationEvent {
  rideId: number;
  lat: number;
  lng: number;
}
