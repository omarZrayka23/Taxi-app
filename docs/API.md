# Cedra — API Contract (v1)

This is the single source of truth between `backend/`, `admin/` and `mobile/`.
Base URL: `http://<host>:4000/api`. All bodies are JSON unless marked *multipart*.

## Conventions

- Auth: `Authorization: Bearer <jwt>` (from register/login). Socket.IO uses `auth: { token }`.
- IDs are integers. Dates/times are ISO-8601 strings. Rental dates are `YYYY-MM-DD`.
- Money: numbers in USD with 2 decimals (`fareUsd`, `priceUsd`, ...). LBP values are computed with the admin-set `lbpRate` and returned as integers (`fareLbp`).
- Uploaded file URLs are **relative** (`/uploads/abc.jpg`); clients prefix them with the server origin (`http://<host>:4000`).
- Pagination: query `?page=1&pageSize=20` → `{ items: [...], total, page, pageSize }`.
- Errors: HTTP 4xx/5xx with body `{ "error": { "code": "SOME_CODE", "message": "Human text" } }`.
  Common codes: `VALIDATION_ERROR` (400, plus `details`), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409).

## Enums

| Name | Values |
|---|---|
| UserRole | `USER`, `ADMIN` |
| UserStatus | `ACTIVE`, `BLOCKED` |
| Language | `ar`, `en` |
| VehicleType | `TAXI`, `TUKTUK` |
| PricingMode | `CALCULATED`, `FIXED_ROUTE` |
| ApprovalStatus (driver/owner/listing) | `PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED` (SUSPENDED: drivers only) |
| BillingPlan | `COMMISSION`, `MONTHLY` |
| DocumentType | `ID_CARD`, `DRIVER_LICENSE`, `CAR_REGISTRATION`, `INSURANCE`, `VEHICLE_PHOTO`, `BUSINESS_LICENSE` |
| RideStatus | `REQUESTED`, `ACCEPTED`, `ARRIVED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `EXPIRED` |
| CancelledBy | `PASSENGER`, `DRIVER`, `ADMIN`, `SYSTEM` |
| OwnerType | `INDIVIDUAL`, `AGENCY`, `PLATFORM` |
| Transmission | `AUTOMATIC`, `MANUAL` |
| FuelType | `GASOLINE`, `DIESEL`, `HYBRID`, `ELECTRIC` |
| RentalMode | `SELF_DRIVE`, `WITH_DRIVER` |
| BookingStatus | `PENDING`, `CONFIRMED`, `REJECTED`, `ACTIVE`, `COMPLETED`, `CANCELLED` |
| LedgerType | `RIDE_COMMISSION`, `RENTAL_COMMISSION`, `SUBSCRIPTION_FEE`, `PAYMENT`, `ADJUSTMENT` |
| PaymentMethod | `CASH`, `WHISH`, `OMT`, `OTHER` |

Active ride statuses = `REQUESTED`, `ACCEPTED`, `ARRIVED`, `IN_PROGRESS`.

## Objects

```ts
User = {
  id, name, phone, email: string|null, role: UserRole, gender: Gender|null /* 'MALE'|'FEMALE', admin-only change */, language: Language,
  phoneVerified: boolean, status: UserStatus, createdAt,
  driverProfile: DriverProfile|null, ownerProfile: OwnerProfile|null
}
DriverProfile = {
  id, userId, vehicleType, vehicleMake, vehicleModel, vehicleColor, plateNumber, licenseNumber,
  status: ApprovalStatus, rejectionReason: string|null, billingPlan: BillingPlan,
  isOnline: boolean, lat: number|null, lng: number|null, ratingAvg: number, ratingCount: number, createdAt
}
OwnerProfile = { id, userId, type: OwnerType, businessName: string|null, status: ApprovalStatus, rejectionReason: string|null, createdAt }
Document = { id, userId, type: DocumentType, url, createdAt }
Place = { id, nameEn, nameAr, lat, lng, radiusKm, active: boolean }
Ride = {
  id, status: RideStatus, vehicleType, driverGender: Gender|null /* null = any driver */, pricingMode,
  pickupLat, pickupLng, pickupAddress, dropoffLat, dropoffLng, dropoffAddress,
  distanceKm, durationMin, fareUsd, fareLbp, note: string|null,
  passenger: { id, name, phone },
  driver: { id /* userId */, name, phone, vehicleType, vehicleMake, vehicleModel, vehicleColor,
            plateNumber, ratingAvg, lat, lng } | null,
  requestedAt, acceptedAt, arrivedAt, startedAt, completedAt, cancelledAt,   // null when not reached
  cancelledBy: CancelledBy|null, cancelReason: string|null,
  ratingByPassenger: number|null, ratingByDriver: number|null, commissionUsd: number
}
Listing = {
  id, owner: { id /* userId */, name, phone, type: OwnerType, businessName },
  make, model, year, seats, transmission, fuelType, color,
  place: { id, nameEn, nameAr }, description: string|null,
  selfDrive: boolean, pricePerDayUsd: number|null,            // self-drive daily price
  withDriver: boolean, withDriverPricePerDayUsd: number|null, // with-driver daily price
  depositUsd, minDays, photos: [{ id, url }],
  status: ApprovalStatus, rejectionReason: string|null, isActive: boolean, createdAt
}
Booking = {
  id, listing: { id, make, model, year, photoUrl: string|null },
  renter: { id, name, phone }, owner: { id, name, phone, businessName },
  startDate, endDate /* return date, exclusive */, days, mode: RentalMode,
  pricePerDayUsd, totalUsd, totalLbp, depositUsd, commissionUsd,
  status: BookingStatus, note: string|null, rejectionReason: string|null, createdAt
}
LedgerEntry = { id, userId, type: LedgerType, amountUsd, description, rideId: number|null, bookingId: number|null, createdAt }
// amountUsd > 0 = user owes platform; < 0 = payment received. balanceUsd = sum(amountUsd).
Subscription = { id, userId, periodStart, periodEnd, active: boolean }
```

## Auth & profile

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/register` | `{ name, phone, password (min 6), gender: 'MALE'\|'FEMALE', language? }` | `{ token, user }` (409 `PHONE_TAKEN`) |
| POST | `/auth/login` | `{ phone, password }` | `{ token, user }` (401 `INVALID_CREDENTIALS`, 403 `USER_BLOCKED`) |
| POST | `/auth/otp/request` | — (auth) | `{ sent: true, devCode?: "123456" }` (`devCode` only when not production) |
| POST | `/auth/otp/verify` | `{ code }` (auth) | `{ user }` (400 `INVALID_CODE`) |
| GET | `/auth/me` | — | `{ user }` |
| PATCH | `/me` | `{ name?, email?, language?, expoPushToken? }` | `{ user }` |

Phone format: Lebanese, stored normalized as `+961XXXXXXXX`; clients may send `03123456`, `3123456`, `+9613123456`.

## Public config

| Method | Path | Response |
|---|---|---|
| GET | `/health` | `{ ok: true }` |
| GET | `/config` | `{ lbpRate, commissionPercent, rentalCommissionPercent, monthlyFeeTaxiUsd, monthlyFeeTuktukUsd, supportPhone, vehicleTypes: [{ type, mode, baseFare, perKm, perMin, minimumFare }] }` |
| GET | `/places` | `{ places: Place[] }` (active only) |

## Documents (auth)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/documents` | *multipart*: `file` (jpg/png/pdf ≤ 8MB), `type` | `{ document }` |
| GET | `/documents` | — | `{ documents }` (own) |

## Rides — passenger (auth)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/rides/estimate` | `{ pickup: {lat,lng}, dropoff: {lat,lng} }` | `{ estimates: [{ vehicleType, fareUsd, fareLbp, pricingMode, distanceKm, durationMin, fromPlace: Place\|null, toPlace: Place\|null, womanDriverNearby: boolean }], hasWomenDrivers: boolean }` (one per vehicle type; `hasWomenDrivers` = an approved, active woman driver is registered; `womanDriverNearby` = one is online, free and within the search radius of pickup) |
| POST | `/rides` | `{ vehicleType, pickup: {lat,lng,address}, dropoff: {lat,lng,address}, note?, driverGender?: 'MALE'\|'FEMALE' }` (with `driverGender`, the ride is offered to and can be accepted only by drivers of that gender) | `{ ride }` (409 `ACTIVE_RIDE_EXISTS`) |
| GET | `/rides/current` | — | `{ ride: Ride\|null }` |
| GET | `/rides` | paginated | `Ride[]` page (own, newest first) |
| GET | `/rides/:id` | — | `{ ride }` (passenger, assigned driver or admin) |
| POST | `/rides/:id/cancel` | `{ reason? }` | `{ ride }` — passenger any active status except `IN_PROGRESS`; driver when `ACCEPTED`/`ARRIVED` |
| POST | `/rides/:id/rate` | `{ stars: 1..5 }` | `{ ride }` — passenger rates driver or driver rates passenger, only `COMPLETED`, once |

## Driver (auth)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/driver/apply` | `{ vehicleType, vehicleMake, vehicleModel, vehicleColor, plateNumber, licenseNumber, billingPlan }` | `{ driverProfile }` (status → `PENDING`; allowed when none or `REJECTED`) |
| PATCH | `/driver/profile` | `{ billingPlan?, vehicleColor? }` | `{ driverProfile }` (409 `GO_OFFLINE_FIRST` if online) |
| POST | `/driver/online` | `{ lat, lng }` | `{ driverProfile }` — 403 `NOT_APPROVED`, 402 `SUBSCRIPTION_REQUIRED`, 402 `DEBT_LIMIT_EXCEEDED` |
| POST | `/driver/offline` | — | `{ driverProfile }` |
| POST | `/driver/location` | `{ lat, lng }` | `{ ok: true }` (socket event preferred) |
| GET | `/driver/current-ride` | — | `{ ride: Ride\|null }` |
| GET | `/driver/offers` | — | `{ rides: Ride[] }` open `REQUESTED` rides currently offered to this driver |
| GET | `/driver/rides` | paginated | `Ride[]` page |
| GET | `/driver/billing` | — | `{ balanceUsd, billingPlan, subscription: Subscription\|null, ledger: LedgerEntry[] (last 50), commissionPercent, monthlyFeeUsd, maxDebtUsd }` |
| POST | `/rides/:id/accept` | — | `{ ride }` (409 `RIDE_NOT_AVAILABLE`) |
| POST | `/rides/:id/arrived` | — | `{ ride }` |
| POST | `/rides/:id/start` | — | `{ ride }` |
| POST | `/rides/:id/complete` | — | `{ ride }` (cash collected by driver; commission charged to ledger if plan = COMMISSION) |

## Rental — renters (auth)

| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | `/rentals` | `?placeId&startDate&endDate&mode&seats&transmission&page` | page of `Listing` (approved + active; if dates given, only available ones) |
| GET | `/rentals/:id` | — | `{ listing, unavailable: [{ startDate, endDate }] }` |
| POST | `/rentals/:id/quote` | `{ startDate, endDate, mode }` | `{ days, pricePerDayUsd, totalUsd, totalLbp, depositUsd }` |
| POST | `/rentals/:id/book` | `{ startDate, endDate, mode, note? }` | `{ booking }` — 400 `LICENSE_REQUIRED` (self-drive needs an uploaded `DRIVER_LICENSE` document), 409 `NOT_AVAILABLE`, 400 `MIN_DAYS` |
| GET | `/bookings` | paginated | `Booking[]` page (as renter) |
| GET | `/bookings/:id` | — | `{ booking }` (renter, owner or admin) |
| POST | `/bookings/:id/cancel` | `{ reason? }` | `{ booking }` (renter, while `PENDING`/`CONFIRMED`) |

## Rental — owners (auth)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/owner/apply` | `{ type: 'INDIVIDUAL'\|'AGENCY', businessName? }` | `{ ownerProfile }` (→ `PENDING`) |
| GET | `/owner/listings` | — | `{ listings }` |
| POST | `/owner/listings` | `{ make, model, year, seats, transmission, fuelType, color, placeId, description?, selfDrive, pricePerDayUsd?, withDriver, withDriverPricePerDayUsd?, depositUsd, minDays }` | `{ listing }` (→ `PENDING`; requires approved owner profile: 403 `OWNER_NOT_APPROVED`) |
| PATCH | `/owner/listings/:id` | any of the above + `isActive?` | `{ listing }` |
| POST | `/owner/listings/:id/photos` | *multipart*: `photos` (1–6 images) | `{ listing }` |
| DELETE | `/owner/listings/:id/photos/:photoId` | — | `{ listing }` |
| GET | `/owner/bookings` | `?status&page` | `Booking[]` page |
| POST | `/owner/bookings/:id/confirm` | — | `{ booking }` (from `PENDING`) |
| POST | `/owner/bookings/:id/reject` | `{ reason? }` | `{ booking }` |
| POST | `/owner/bookings/:id/start` | — | `{ booking }` (car handed over, `CONFIRMED`→`ACTIVE`) |
| POST | `/owner/bookings/:id/complete` | — | `{ booking }` (`ACTIVE`→`COMPLETED`, rental commission charged unless owner type `PLATFORM`) |

Admins automatically have an approved `PLATFORM` owner profile, so the admin panel uses these same `/owner/*` endpoints to manage platform-owned cars.

## Admin (auth, role `ADMIN`) — prefix `/admin`

| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | `/admin/stats` | — | `{ users, drivers: { total, pending, online }, ownersPending, listingsPending, rides: { today, completedToday, revenueTodayUsd }, bookings: { pending, active }, outstandingDebtUsd }` |
| GET | `/admin/users` | `?search&page` | `User[]` page |
| PATCH | `/admin/users/:id` | `{ status?, gender? }` (at least one) | `{ user }` |
| GET | `/admin/drivers` | `?status&search&page` | page of `DriverProfile & { user: {id,name,phone}, balanceUsd }` |
| GET | `/admin/drivers/:id` | — | `{ driver: DriverProfile & { user }, documents: Document[], balanceUsd, subscription }` (`:id` = DriverProfile id) |
| POST | `/admin/drivers/:id/approve` \| `/reject` \| `/suspend` \| `/reactivate` | `{ reason? }` | `{ driver }` |
| GET | `/admin/owners` | `?status&page` | page of `OwnerProfile & { user: {id,name,phone} }` |
| GET | `/admin/owners/:id` | — | `{ owner, documents }` |
| POST | `/admin/owners/:id/approve` \| `/reject` | `{ reason? }` | `{ owner }` |
| GET | `/admin/listings` | `?status&page` | `Listing[]` page |
| POST | `/admin/listings/:id/approve` \| `/reject` | `{ reason? }` | `{ listing }` |
| GET | `/admin/rides` | `?status&page` | `Ride[]` page |
| POST | `/admin/rides/:id/cancel` | `{ reason? }` | `{ ride }` |
| GET | `/admin/bookings` | `?status&page` | `Booking[]` page |
| GET | `/admin/pricing` | — | `{ vehicleTypes: [{ type, mode, baseFare, perKm, perMin, minimumFare }] }` |
| PUT | `/admin/pricing/:vehicleType` | `{ mode, baseFare, perKm, perMin, minimumFare }` | `{ pricing }` |
| GET | `/admin/places` | — | `{ places }` (incl. inactive) |
| POST | `/admin/places` | `{ nameEn, nameAr, lat, lng, radiusKm, active? }` | `{ place }` |
| PATCH | `/admin/places/:id` | partial | `{ place }` |
| DELETE | `/admin/places/:id` | — | `{ ok: true }` (409 `PLACE_IN_USE` if listings reference it) |
| GET | `/admin/route-fares` | — | `{ items: [{ id, fromPlace: Place, toPlace: Place, vehicleType, priceUsd, bidirectional }] }` |
| POST | `/admin/route-fares` | `{ fromPlaceId, toPlaceId, vehicleType, priceUsd, bidirectional }` | `{ routeFare }` (409 `DUPLICATE_ROUTE`) |
| PATCH | `/admin/route-fares/:id` | partial | `{ routeFare }` |
| DELETE | `/admin/route-fares/:id` | — | `{ ok: true }` |
| GET | `/admin/settings` | — | `{ commissionPercent, rentalCommissionPercent, monthlyFeeTaxiUsd, monthlyFeeTuktukUsd, lbpRate, maxDebtUsd, searchRadiusKm, offerTimeoutSec, fareRoundingUsd, supportPhone }` |
| PUT | `/admin/settings` | partial of the above | same shape |
| GET | `/admin/billing/accounts` | `?search&page` | page of `{ user: {id,name,phone}, kinds: ('DRIVER'\|'OWNER')[], billingPlan: BillingPlan\|null, balanceUsd, subscription: Subscription\|null }` |
| GET | `/admin/billing/accounts/:userId` | — | `{ user, balanceUsd, subscription, entries: LedgerEntry[] }` |
| POST | `/admin/billing/accounts/:userId/payments` | `{ amountUsd (>0), method: PaymentMethod, note? }` | `{ entry, balanceUsd }` |
| POST | `/admin/billing/accounts/:userId/subscription` | `{ months (1..12) }` | `{ subscription, balanceUsd }` — charges `months × monthlyFee` and extends the period |
| POST | `/admin/billing/accounts/:userId/adjustments` | `{ amountUsd (±), note }` | `{ entry, balanceUsd }` |

## Socket.IO (path `/socket.io`, same origin as API)

Connect: `io(SERVER_ORIGIN, { auth: { token } })`. Each user is joined to room `user:<id>`.

Server → client:

| Event | Payload | To |
|---|---|---|
| `ride:offer` | `{ ride: Ride, expiresAt }` | nearby online approved drivers of that vehicle type |
| `ride:offer:closed` | `{ rideId }` | drivers who got the offer (taken, cancelled or expired) |
| `ride:update` | `{ ride: Ride }` | passenger and assigned driver on every status change |
| `driver:location` | `{ rideId, lat, lng }` | passenger of the driver's active ride |
| `booking:update` | `{ booking: Booking }` | renter and owner on every booking status change |
| `account:update` | `{ user: User }` | the user, when admin approves/rejects/suspends driver or owner profile |

Client → server:

| Event | Payload | From |
|---|---|---|
| `driver:location` | `{ lat, lng }` | online driver, every ~5 s |

## Business rules (summary)

- **Pricing**: for each vehicle type the admin chooses `CALCULATED` or `FIXED_ROUTE`.
  - Calculated: `max(minimumFare, baseFare + perKm·km + perMin·min)` rounded up to `fareRoundingUsd`.
  - Fixed route: pickup and dropoff are matched to the nearest active Place whose radius contains them; if a RouteFare exists for (from, to, vehicleType) — or (to, from) when `bidirectional` — that price is used. Otherwise fall back to calculated.
- **Dispatch**: a new ride is offered to up to 10 nearest online, approved drivers of that type, located in the last 2 minutes, within `searchRadiusKm`, without an active ride. First to accept wins. If nobody accepts within `offerTimeoutSec` the ride becomes `EXPIRED`.
- **Driver billing**: `COMMISSION` plan → `commissionPercent` of each completed fare is added to the driver's balance. `MONTHLY` plan → admin activates months (fee charged to balance); driver can go online only while the subscription is active. Any driver whose balance exceeds `maxDebtUsd` cannot go online until they pay. Passengers pay drivers cash.
- **Rental**: owner confirms each booking. Self-drive requires the renter to have uploaded a `DRIVER_LICENSE` document. Bookings for the same listing cannot overlap with `PENDING`/`CONFIRMED`/`ACTIVE` ones. Deposit is handled in person and only displayed by the app. On completion `rentalCommissionPercent` of the total is charged to the owner (not for `PLATFORM`).
