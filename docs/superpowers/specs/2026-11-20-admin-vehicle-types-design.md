# Admin-managed ride vehicle types — design

Date: 2026-11-20 · Status: approved

## Intent
The owner wants passengers to be able to book a **motorcycle, van or bus** for a ride, next to today's Taxi and
Tuk-tuk, and wants the **admin to add vehicle types from the admin panel** instead of a developer changing code each
time. Today the two types are hard-coded in ~15 places (Prisma enum, zod enums, default prices, two fixed
monthly-fee settings, admin lists/badges, mobile union type, icons and i18n keys).

A van or bus is booked **whole**: one passenger books the entire vehicle for their group. It is the same ride flow
as a taxi — same request → offer → accept → arrive → start → complete — just a different vehicle and price.

Vans and buses come in different sizes (e.g. 7, 8 and 11 seats). The owner chose to handle this by the admin adding
**one type per size** ("Van 7", "Van 11", …), each with its own price. Capacity therefore belongs to the type, not
to each driver's vehicle; drivers pick their exact size type when applying.

## Goals
- A new admin page **Vehicle types** (replaces the Pricing page) lists all types and lets the admin add and edit
  one. Each type has:
  - **code** — short uppercase id (e.g. `VAN`), set on create, never changes afterwards
  - **name in English and Arabic**
  - **icon** — picked from a fixed set: car, tuk-tuk, motorcycle, van, bus
  - **capacity** — max passengers (shown to passengers, e.g. "Van · up to 7")
  - **pricing** — exactly what the Pricing page has today: mode (Calculated / Fixed route), base fare, per km,
    per minute, minimum fare
  - **monthly fee (USD)** — what a driver of this type pays on the Monthly billing plan
  - **active** on/off
  - **sort order** — order of the cards in the passenger app and lists
- Passengers see one price card per **active** type on the confirm screen, with the type's name (in the app
  language), icon and "up to N passengers". Everything else on that screen (Man/Woman row, nearest-driver ETA once
  built) works the same for every type.
- Drivers choose from the active types when applying. Dispatch matches drivers to rides by type, as today.
- Route fares can be set for any type (existing Route fares page, type list loaded from the server).
- Monthly subscription fee comes from the driver's vehicle type everywhere it is used today (activate subscription,
  driver billing screen, driver-apply screen, admin billing page).
- Everywhere a type's name or icon is shown (admin badges, rides list, driver dashboard, passenger ride history,
  active-ride sheet), it comes from the server data, not from hard-coded keys, so a newly added type displays
  correctly in both apps with no code change.
- Existing Taxi and Tuk-tuk data carries over unchanged: same codes, same prices, same monthly fees, drivers and
  rides keep their type.

## Non-goals
- No shared/seat-based rides, schedules or multiple passengers on one ride (van/bus = whole vehicle).
- No per-driver seat count and no "how many riders" input for passengers (rejected by the owner in favour of one
  type per size).
- No vehicle types for **rentals** (rental listings stay "cars" as today).
- Admin cannot change an existing driver's vehicle type in this change; a driver with a different vehicle
  re-applies as today (only allowed after rejection — admin can reject to let them re-apply).
- No per-type document requirements (same documents for every type).
- No uploading custom icons; the fixed icon set is enough.
- Refreshing the Arabic admin guide (`docs/admin-guide/`) and its screenshots is a separate follow-up.

## Anti-goals
- A newly added type must not show as a raw key (`vehicle.VAN`) or a blank icon anywhere in either app.
- Turning a type off or editing it must never break history: old rides, ledger entries and route fares keep
  showing the right name.

## Approaches
- **A. One Vehicle types table + one admin page holding names, icon, capacity, pricing and monthly fee (chosen by
  owner).** Adding a type is one form. Pricing rules and the two fixed fee settings fold into it.
- B. Same table for names/icons, but pricing stays on the Pricing page and fees on Settings — rejected: adding a
  type means visiting three pages, and the fee settings need reworking anyway (they are exactly one Taxi field and
  one Tuk-tuk field).
- C. Add MOTORCYCLE / VAN / BUS to the code enum — rejected by the owner: every future type would need a developer.

## Decisions (how)
- **Data model.** New Prisma model `VehicleType` keyed by `code` (VarChar(20), `^[A-Z][A-Z0-9_]*$`). It holds
  `nameEn`, `nameAr`, `icon` (Prisma enum `VehicleIcon { CAR TUKTUK MOTORCYCLE VAN BUS }`), `capacity`, the
  pricing fields from today's `PricingRule`, `monthlyFeeUsd`, `active`, `sortOrder`, timestamps.
  `DriverProfile.vehicleType`, `Ride.vehicleType` and `RouteFare.vehicleType` become `String` columns with a
  relation to `VehicleType.code`. Column names stay `vehicleType`, so API field names stay the same and the
  existing values `TAXI` / `TUKTUK` keep working. `PricingRule` and the enum `VehicleType` are removed; the
  `monthlyFeeTaxiUsd` / `monthlyFeeTuktukUsd` settings are removed (Settings page loses them).
  *(Designer's call, compatibility)* `/config` keeps sending `monthlyFeeTaxiUsd` / `monthlyFeeTuktukUsd` (read
  from the TAXI / TUKTUK rows, 0 if missing) and keeps a `type` field equal to `code` on each `vehicleTypes` item,
  so an already-installed older app build keeps working. It's not known whether any tester phones point at a
  shared server; this costs a few lines and removes the risk. Marked for removal once old builds are gone.
- **Turn off vs delete.** Turning a type off hides it from passenger estimates and driver applications and
  rejects new ride requests/applications for it (validation error). Approved drivers of an off type stay as they
  are but simply receive no rides; the admin page shows how many drivers use each type so the admin sees who is
  affected. **Delete** is allowed only when no driver, ride or route fare uses the type; otherwise the API refuses
  with a clear error telling the admin to turn it off instead (same pattern as `PLACE_IN_USE`).
- **Validation.** Everywhere a zod `z.enum(['TAXI','TUKTUK'])` exists today, the code is checked against the
  table instead (exists, and active where a new ride/application is being created; admin route-fare forms may
  use any existing type).
- **API.** `GET /config` returns `vehicleTypes` as the active types in sort order, each with code, names, icon,
  capacity, monthly fee and pricing. `POST /rides/estimate` estimates only active types. Admin gets CRUD under
  `/admin/vehicle-types` (list includes inactive types and driver counts); the old `/admin/pricing` endpoints go
  away. Responses that include a ride or driver profile carry enough to show the type's names and icon without
  `/config` (builder picks the exact shape, e.g. a small `vehicle: { code, nameEn, nameAr, icon }` object next to
  `vehicleType`) — needed because history can contain types that are now inactive. *(Designer's call)* These
  names come from a join, so renaming a type also renames it in past rides; no name snapshot on `Ride`. Renames
  are expected to be corrections, and the code never changes.
- **Commission** stays one global percentage for all types *(designer's call)*.
- **Existing data.** The project uses `prisma db push` (no migrations folder) and the app has not launched
  (existing data is test data). Converting the MySQL enum columns to VARCHAR keeps their values.
  *(Designer's call)* The builder writes a small, **re-runnable** script (`backend/scripts/`, safe to run twice)
  that, on an existing database: (1) changes the three columns to VARCHAR without foreign keys, (2) creates the
  `TAXI` and `TUKTUK` rows from the current `PricingRule` rows (or today's `DEFAULT_RATES` if missing) and the
  current monthly-fee settings, then (3) lets `prisma db push` add the new table's foreign keys. The backend
  README gets the steps, including "back up first". Fresh databases (dev-db, e2e) just use `db push` + seed.
  Taxi: icon car, capacity 4. Tuk-tuk: icon tuk-tuk, capacity 3. Test it once against a dev database filled by
  the *old* seed.
- **Seed / dev DB.** The seed creates Taxi and Tuk-tuk as today plus Motorcycle (capacity 1), Van 7 (7), Van 11
  (11) and Bus (20) with placeholder prices, so the demo shows the one-type-per-size idea. The e2e count
  assertion is updated to match.
- **Mobile.** The app's `VehicleType` becomes `string`. Names come from the server in the current language;
  icons map from the icon enum to vector icons (fallback: car). The hard-coded Segmented control in
  driver-apply becomes a list built from `/config`; fee shown comes from the selected type. The `vehicle.*`
  i18n keys go away. Default selected vehicle on the confirm screen = first card.
- **Admin.** "Vehicle types" replaces "Pricing" in the sidebar; the explanation of Calculated vs Fixed route moves
  onto it. Route fares page loads the type list from the server. Settings page loses the two fee fields. Billing
  account page shows the driver's type fee instead of "Taxi $X, Tuk-tuk $Y". `StatusBadge` shows the server name
  for vehicle types (colour by icon).
- **Related work.** The nearest-driver ETA plan (`docs/superpowers/plans/2026-11-20-nearest-driver-eta.md`) uses
  the vehicle type code only, so it works with any type; whichever is built second adapts to the other.

## Constraints
- Stack: Express 5 + Prisma + MySQL backend, Expo (React Native) app, React + Mantine admin. Arabic + English.
- Gender preference (`driverGender`) and dispatch rules (`findAvailableDrivers`) are unchanged apart from the
  type being a string.
- Existing tests (`backend/tests`, `scripts/e2e.ts`) must keep passing; e2e asserts `config.vehicleTypes.length`
  and uses TAXI / TUKTUK.

## Left to the builder
- Exact admin layout (table + modal form like Places, or cards like today's Pricing).
- Exact response shapes beyond what's above, icon library choice in each app, colours.
- Wording and translations, docs/API.md updates, unit and e2e tests (cover: create type → driver applies →
  estimate shows it → ride dispatched; turn off hides it and rejects requests; delete refused when in use).
