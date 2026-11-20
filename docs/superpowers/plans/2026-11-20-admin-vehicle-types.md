# Admin-managed Vehicle Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hard-coded `TAXI | TUKTUK` vehicle enum with a `VehicleType` table the admin manages (names, icon, capacity, pricing, monthly fee, on/off, order), used by rides, drivers, route fares, billing, the admin panel and the mobile app.

**Architecture:** A `VehicleType` Prisma model keyed by `code` replaces the `VehicleType` enum, the `PricingRule` model and the two monthly-fee settings. `DriverProfile`, `Ride` and `RouteFare` keep a `vehicleType` string column with a `vehicle` relation to it, so API field names don't change. Ride and driver-profile responses carry a `vehicle` summary (names, icon, capacity) so both apps show any type without hard-coded keys.

**Tech Stack:** Express 5 + Prisma 5 + MySQL + zod + vitest (backend, e2e via `mysql-memory-server`), React + Mantine + TanStack Query (admin), Expo / React Native + i18next (mobile).

**Spec:** `docs/superpowers/specs/2026-11-20-admin-vehicle-types-design.md`

## Global Constraints

- Code format: `^[A-Z][A-Z0-9_]*$`, max 20 chars, set on create, never changes.
- Icon set is exactly `CAR | TUKTUK | MOTORCYCLE | VAN | BUS`.
- Existing codes `TAXI` and `TUKTUK` keep working everywhere (API fields, existing rows).
- Legacy rows created by the migration: Taxi = icon CAR, capacity 4; Tuk-tuk = icon TUKTUK, capacity 3.
- Seed: Taxi, Tuk-tuk (today's prices), Motorcycle (capacity 1), Van 7 (7), Van 11 (11), Bus (20); placeholder prices.
- `/config` keeps `monthlyFeeTaxiUsd`, `monthlyFeeTuktukUsd` (from the TAXI / TUKTUK rows, 0 if missing) and a `type` field equal to `code` on each `vehicleTypes` item — for old app builds.
- Renaming a type renames it in history (join, no snapshot). Commission stays one global percentage.
- Turned-off type: hidden from `/config` and estimates; new ride requests and driver applications for it are rejected; its approved drivers stay approved.
- Delete is refused while any driver, ride or route fare uses the type.
- Arabic + English for every new user-facing string in the mobile app.
- Gender preference and dispatch rules (`findAvailableDrivers`) unchanged apart from the type being a string.

## Review Focus

1. Admin turns a type off while a ride of that type is already `REQUESTED` → that ride can still be accepted and completed; only *new* requests are rejected. (Task 2 e2e)
2. All types turned off → `/rides/estimate` returns `estimates: []` (200), and the passenger confirm screen shows an empty message instead of crashing on `list[0]`. (Task 2 e2e, Task 5 manual)
3. Admin types a code like `van 7` or `Van-7` → API rejects with `VALIDATION_ERROR`; the admin form uppercases input and shows the rule. (Task 2 e2e, Task 4)
4. A past ride whose type is now off still shows its name and icon in history (`GET /rides/:id` has `vehicle.nameEn`). (Task 2 e2e)
5. Deleting a type used only by a route fare (no drivers or rides) is refused with `VEHICLE_TYPE_IN_USE`. (Task 2 e2e)

---

### Task 1: Backend — VehicleType model replaces enum, PricingRule and fee settings

**Files:**
- Modify: `backend/prisma/schema.prisma` (enum `VehicleType` → model; drop `PricingRule`; relations on `DriverProfile`, `Ride`, `RouteFare`)
- Create: `backend/src/services/vehicleTypes.ts`
- Modify: `backend/src/services/pricing.ts`, `backend/src/services/pricingData.ts`, `backend/src/services/settings.ts`, `backend/src/services/serializers.ts`, `backend/src/services/rides.ts`
- Modify: `backend/src/routes/rides.ts`, `backend/src/routes/driver.ts`, `backend/src/routes/public.ts`, `backend/src/routes/admin/config.ts` (route-fare validation, settings keys), `backend/src/routes/admin/billing.ts`, `backend/src/routes/admin/manage.ts` (includes)
- Modify: `backend/prisma/seed.ts`
- Test: `backend/tests/vehicleTypes.test.ts`, `backend/tests/pricing.test.ts`, `backend/scripts/e2e.ts`

**Interfaces:**
- Produces (schema):
  ```prisma
  enum VehicleIcon { CAR TUKTUK MOTORCYCLE VAN BUS }
  model VehicleType {
    code          String      @id @db.VarChar(20)
    nameEn        String      @db.VarChar(60)
    nameAr        String      @db.VarChar(60)
    icon          VehicleIcon
    capacity      Int
    mode          PricingMode @default(CALCULATED)
    baseFare      Decimal     @db.Decimal(10, 2)
    perKm         Decimal     @db.Decimal(10, 2)
    perMin        Decimal     @db.Decimal(10, 2)
    minimumFare   Decimal     @db.Decimal(10, 2)
    monthlyFeeUsd Decimal     @default(0) @db.Decimal(10, 2)
    active        Boolean     @default(true)
    sortOrder     Int         @default(0)
    createdAt     DateTime    @default(now())
    updatedAt     DateTime    @updatedAt
    drivers DriverProfile[]
    rides   Ride[]
    routeFares RouteFare[]
  }
  ```
  On `DriverProfile`, `Ride`, `RouteFare`: `vehicleType String @db.VarChar(20)` + `vehicle VehicleType @relation(fields: [vehicleType], references: [code])` (default Restrict). Existing indexes/uniques on `vehicleType` stay.
- Produces (`services/vehicleTypes.ts`):
  - `vehicleCode: z.ZodString` — `z.string().trim().regex(/^[A-Z][A-Z0-9_]{0,19}$/)`
  - `type VehicleSummary = { code: string; nameEn: string; nameAr: string; icon: VehicleIcon; capacity: number }`
  - `vehicleSummary(v: VehicleType): VehicleSummary`
  - `ratesOf(v: VehicleType): Rates`
  - `listVehicleTypes(opts?: { activeOnly?: boolean }): Promise<VehicleType[]>` — ordered `sortOrder asc, code asc`
  - `requireVehicleType(code: string, opts: { active: boolean }): Promise<VehicleType>` — throws `badRequest('INVALID_VEHICLE_TYPE', ...)` when missing, or inactive and `opts.active`
  - `LEGACY_VEHICLE_TYPES: Record<'TAXI' | 'TUKTUK', Omit<Prisma.VehicleTypeCreateInput, 'monthlyFeeUsd'>>` — today's `DEFAULT_RATES`, mode CALCULATED, names Taxi/تاكسي, Tuk-tuk/توك توك, icons/capacities from Global Constraints. Used by seed and Task 3.
- Produces (response shapes):
  - each `/rides/estimate` item gains `vehicle: VehicleSummary`
  - `serializeRide(r)` gains `vehicle: VehicleSummary`; `rideInclude` gains `vehicle: true`
  - `serializeDriverProfile(d: DriverProfile & { vehicle: VehicleType }, ...)` gains `vehicle: VehicleSummary`; `userInclude.driverProfile` becomes `{ include: { vehicle: true } }`; same for `driverInclude` in `manage.ts` and `serializeMyProfile` in `driver.ts`
  - `/config.vehicleTypes[]`: `{ type, code, nameEn, nameAr, icon, capacity, monthlyFeeUsd, mode, baseFare, perKm, perMin, minimumFare }` (active only), plus top-level `monthlyFeeTaxiUsd`, `monthlyFeeTuktukUsd`
- Removes: `VEHICLE_TYPES`, `DEFAULT_RATES`, `getPricingRules` (pricingData), `monthlyFeeTaxiUsd`/`monthlyFeeTuktukUsd`/`monthlyFeeFor` (settings). `RouteFareLike.vehicleType` and `quoteFare`'s `vehicleType` become `string`.

- [ ] **Step 1: Write the failing unit test** `backend/tests/vehicleTypes.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { ratesOf, vehicleCode, vehicleSummary } from '../src/services/vehicleTypes.js';

const van = {
  code: 'VAN_7', nameEn: 'Van 7', nameAr: 'فان ٧', icon: 'VAN', capacity: 7, mode: 'FIXED_ROUTE',
  baseFare: new Prisma.Decimal(2), perKm: new Prisma.Decimal(1.2), perMin: new Prisma.Decimal(0.1),
  minimumFare: new Prisma.Decimal(5), monthlyFeeUsd: new Prisma.Decimal(40), active: true, sortOrder: 3,
  createdAt: new Date(), updatedAt: new Date(),
} as const;

describe('vehicleCode', () => {
  it('accepts uppercase codes', () => {
    expect(vehicleCode.parse('VAN_7')).toBe('VAN_7');
  });
  it.each(['van 7', 'Van-7', '7VAN', '', 'A'.repeat(21)])('rejects %j', (c) => {
    expect(vehicleCode.safeParse(c).success).toBe(false);
  });
});

describe('ratesOf / vehicleSummary', () => {
  it('converts decimals to numbers', () => {
    expect(ratesOf(van as any)).toEqual({ mode: 'FIXED_ROUTE', baseFare: 2, perKm: 1.2, perMin: 0.1, minimumFare: 5 });
  });
  it('exposes only display fields', () => {
    expect(vehicleSummary(van as any)).toEqual({ code: 'VAN_7', nameEn: 'Van 7', nameAr: 'فان ٧', icon: 'VAN', capacity: 7 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/vehicleTypes.test.ts`
Expected: FAIL — cannot resolve `../src/services/vehicleTypes.js`

- [ ] **Step 3: Change `schema.prisma` as in Interfaces and run `npx prisma generate`**

Expected: generate succeeds; `npm run typecheck` now lists errors in every file under **Files** (that list is the to-do for Steps 4–5).

- [ ] **Step 4: Implement `services/vehicleTypes.ts`** per Interfaces. Unit test passes: `npx vitest run tests/vehicleTypes.test.ts` → PASS.

- [ ] **Step 5: Port every caller until `npm run typecheck` is clean**
  - `pricingData.estimateFares`: iterate `listVehicleTypes({ activeOnly: true })`, rates via `ratesOf`, add `vehicle: vehicleSummary(v)` per estimate.
  - `routes/rides.ts`: `POST /` body uses `vehicleType: vehicleCode`, then `await requireVehicleType(body.vehicleType, { active: true })` before the active-ride check. `const est = estimates.find(...)` keeps working because the type is active.
  - `routes/driver.ts` `/apply`: same pattern with `{ active: true }`. Billing route: `monthlyFeeUsd: num(profile.vehicle.monthlyFeeUsd)` (load profile with `include: { vehicle: true }`).
  - `routes/admin/billing.ts` subscription: fee from the driver's `vehicle.monthlyFeeUsd` (extend `loadAccountUser`'s include).
  - `routes/admin/config.ts`: route-fare body `vehicleType: vehicleCode` + `requireVehicleType(code, { active: false })`; drop the two fee keys from the settings schema; delete the `/admin/pricing` GET/PUT endpoints (Task 2 adds their replacement; the admin panel is ported in Task 4).
  - `routes/public.ts` `/config`: shape from Interfaces.
  - `services/rides.ts`: `DriverProfile['vehicleType']` is now `string`; no logic change.
  - `seed.ts`: upsert the six seed types (`update: {}`); TAXI/TUKTUK from `LEGACY_VEHICLE_TYPES` with `mode: 'FIXED_ROUTE'` as today and monthly fees 30 / 15; Motorcycle `MOTORCYCLE` cap 1, Van 7 `VAN_7` cap 7, Van 11 `VAN_11` cap 11, Bus `BUS` cap 20, all CALCULATED, sortOrder 1..6, Arabic names: دراجة نارية / فان ٧ ركاب / فان ١١ راكب / باص. Route fares unchanged (TAXI/TUKTUK). Remove the `PricingRule` block.
  - `tests/pricing.test.ts`: only type annotations change; assertions stay.

- [ ] **Step 6: Update e2e** in `backend/scripts/e2e.ts`: `assert.equal(config.vehicleTypes.length, 6)`; assert `config.vehicleTypes[0].code === 'TAXI'`, `config.vehicleTypes[0].type === 'TAXI'`, `config.monthlyFeeTaxiUsd === 30`; after the first TAXI ride is created assert `ride.vehicle.nameEn === 'Taxi'`; assert the TAXI estimate has `vehicle.capacity === 4`; `fails('INVALID_VEHICLE_TYPE', 'POST', '/rides', P, { vehicleType: 'NOPE', ... })`.

- [ ] **Step 7: Run everything**

Run: `cd backend && npm run typecheck && npm test && npm run test:e2e`
Expected: typecheck clean; vitest all PASS; e2e ends with `All e2e scenarios passed.`

- [ ] **Step 8: Commit**

```bash
git add backend/prisma backend/src backend/tests backend/scripts/e2e.ts
git commit -m "feat(backend): vehicle types table replaces enum, pricing rules and fee settings"
```

---

### Task 2: Backend — admin vehicle-types API

**Files:**
- Create: `backend/src/routes/admin/vehicleTypes.ts` (mounted in `backend/src/app.ts` as `admin.use('/vehicle-types', adminVehicleTypesRouter)`)
- Modify: `backend/src/services/vehicleTypes.ts`
- Modify: `docs/API.md` (new endpoints; `/config`, estimate, ride and driver-profile `vehicle` field; `/admin/pricing` removed; fee settings removed)
- Test: `backend/scripts/e2e.ts`

**Interfaces:**
- Consumes: Task 1's `vehicleCode`, `requireVehicleType`, `listVehicleTypes`, `vehicleSummary`.
- Produces:
  - `serializeVehicleType(v: VehicleType, driverCount: number)` → `{ code, nameEn, nameAr, icon, capacity, mode, baseFare, perKm, perMin, minimumFare, monthlyFeeUsd, active, sortOrder, driverCount }` (numbers, not Decimals)
  - `GET /admin/vehicle-types` → `{ items: AdminVehicleType[] }` (all types, sorted, `driverCount` = all driver profiles with that type)
  - `POST /admin/vehicle-types` body `{ code, nameEn (1–60), nameAr (1–60), icon, capacity (int 1–100), mode, baseFare, perKm, perMin, minimumFare, monthlyFeeUsd (money), active?, sortOrder? (int ≥ 0) }` → 201 `{ vehicleType }`; existing code → 409 `VEHICLE_TYPE_EXISTS`
  - `PATCH /admin/vehicle-types/:code` body = POST body without `code`, all optional → `{ vehicleType }`; unknown → 404
  - `DELETE /admin/vehicle-types/:code` → `{ ok: true }`; any driver/ride/route fare uses it → 409 `VEHICLE_TYPE_IN_USE` with message "… turn it off instead"

- [ ] **Step 1: Write the failing e2e block** (append a `// ---------- vehicle types ----------` section before the final `console.log` in `e2e.ts`; reuse the existing helpers, an approved TAXI driver token `D`, passenger `P`, and the `minieh`/`tripoli` places):

```ts
const vt = { code: 'MINIBUS', nameEn: 'Minibus', nameAr: 'ميني باص', icon: 'VAN', capacity: 9, mode: 'CALCULATED',
  baseFare: 2, perKm: 1, perMin: 0.1, minimumFare: 4, monthlyFeeUsd: 25 };
// Review Focus 3
await fails('VALIDATION_ERROR', 'POST', '/admin/vehicle-types', admin, { ...vt, code: 'van 7' });
assert.equal((await ok('POST', '/admin/vehicle-types', admin, vt)).vehicleType.driverCount, 0);
await fails('VEHICLE_TYPE_EXISTS', 'POST', '/admin/vehicle-types', admin, vt);
// new driver token M: register, apply with vehicleType 'MINIBUS', upload docs, admin approves, goes online at
// Minieh (follow the existing driver-onboarding pattern in this file)
assert.ok((await estimate()).estimates.some((e: any) => e.vehicleType === 'MINIBUS' && e.vehicle.capacity === 9));
const mr = (await ok('POST', '/rides', P, { vehicleType: 'MINIBUS', pickup: at(minieh, 'A'), dropoff: at(tripoli, 'B') })).ride;
// Review Focus 1: turn off while REQUESTED → the driver can still accept
await ok('PATCH', '/admin/vehicle-types/MINIBUS', admin, { active: false });
await ok('POST', `/rides/${mr.id}/accept`, M);
assert.ok(!(await estimate()).estimates.some((e: any) => e.vehicleType === 'MINIBUS'));
assert.ok(!(await ok('GET', '/config')).vehicleTypes.some((v: any) => v.code === 'MINIBUS'));
// (cancel/complete mr so P has no active ride, then:)
await fails('INVALID_VEHICLE_TYPE', 'POST', '/rides', P, { vehicleType: 'MINIBUS', pickup: at(minieh, 'A'), dropoff: at(tripoli, 'B') });
// Review Focus 4: history still shows the name
assert.equal((await ok('GET', `/rides/${mr.id}`, P)).ride.vehicle.nameEn, 'Minibus');
const listed = (await ok('GET', '/admin/vehicle-types', admin)).items.find((v: any) => v.code === 'MINIBUS');
assert.equal(listed.driverCount, 1);
assert.equal(listed.active, false);
await fails('VEHICLE_TYPE_IN_USE', 'DELETE', '/admin/vehicle-types/MINIBUS', admin);
// Review Focus 5: a route fare alone blocks delete
await ok('POST', '/admin/vehicle-types', admin, { ...vt, code: 'SHUTTLE' });
await ok('POST', '/admin/route-fares', admin, { fromPlaceId: minieh.id, toPlaceId: tripoli.id, vehicleType: 'SHUTTLE', priceUsd: 6, bidirectional: true });
await fails('VEHICLE_TYPE_IN_USE', 'DELETE', '/admin/vehicle-types/SHUTTLE', admin);
// unused type can be deleted
await ok('POST', '/admin/vehicle-types', admin, { ...vt, code: 'TEMP' });
await ok('DELETE', '/admin/vehicle-types/TEMP', admin);
await fails('NOT_FOUND', 'PATCH', '/admin/vehicle-types/TEMP', admin, { active: true });
// Review Focus 2: no active types → empty estimates, not an error
// (turn all types off with PATCH, assert (await estimate()).estimates is [], then turn TAXI/TUKTUK back on)
await fails('NOT_FOUND', 'GET', '/admin/pricing', admin);
log('vehicle types: create, validate, offer, turn off mid-ride, history name, delete guard, empty estimates');
```

Order the lines so `vt` is declared before its first use; `estimate()` / `at()` already exist in the gender block — hoist them if needed.

- [ ] **Step 2: Run e2e to verify it fails**

Run: `cd backend && npm run test:e2e`
Expected: FAIL at the first `/admin/vehicle-types` call (`NOT_FOUND`)

- [ ] **Step 3: Implement the router** per Interfaces. The delete guard counts `driverProfile`, `ride` and `routeFare` rows with that code.

- [ ] **Step 4: Run all backend checks**

Run: `cd backend && npm run typecheck && npm test && npm run test:e2e`
Expected: all PASS, e2e ends with `All e2e scenarios passed.`

- [ ] **Step 5: Update `docs/API.md`** and commit

```bash
git add backend/src backend/scripts/e2e.ts docs/API.md
git commit -m "feat(backend): admin vehicle types API"
```

---

### Task 3: Backend — re-runnable migration for existing databases

**Files:**
- Create: `backend/scripts/migrate-vehicle-types.ts` (npm script `db:migrate-vehicle-types`)
- Create: `backend/scripts/check-vehicle-types-migration.ts` (npm script `test:migrate-vehicle-types`)
- Modify: `backend/package.json`, `backend/README.md` (upgrade steps: back up → run script)

**Interfaces:**
- Consumes: `LEGACY_VEHICLE_TYPES` (Task 1).
- Produces: `npm run db:migrate-vehicle-types` — safe on a database built from the old schema and on one already migrated.

Algorithm (the order matters because MySQL won't add a foreign key while rows point at missing codes):
1. If table `DriverProfile` doesn't exist → run `npx prisma db push --skip-generate` and stop (fresh DB).
2. Snapshot: `PricingRule` rows (if the table exists) and `Setting` rows `monthlyFeeTaxiUsd` / `monthlyFeeTuktukUsd`.
3. `ALTER TABLE \`DriverProfile\`|\`Ride\`|\`RouteFare\` MODIFY \`vehicleType\` VARCHAR(20) NOT NULL` (idempotent).
4. `CREATE TABLE IF NOT EXISTS \`VehicleType\` …` — paste the exact DDL from `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` (VehicleType table only).
5. `INSERT IGNORE` TAXI and TUKTUK from `LEGACY_VEHICLE_TYPES`, overriding pricing with the snapshot's `PricingRule` values when present, and `monthlyFeeUsd` from the snapshot settings (default 30 / 15).
6. Fail loudly if any `vehicleType` value in the three tables has no `VehicleType` row (list them).
7. `npx prisma db push --skip-generate --accept-data-loss` (adds FKs, drops `PricingRule`), then `DELETE FROM Setting WHERE key IN ('monthlyFeeTaxiUsd','monthlyFeeTuktukUsd')`.

- [ ] **Step 1: Write the check script** `check-vehicle-types-migration.ts`: start `mysql-memory-server`; write `git show be98274:backend/prisma/schema.prisma` to a temp file and `prisma db push --schema <tmp>`; insert with raw SQL one user, a `DriverProfile` (TUKTUK), a `Ride` (TUKTUK), a `RouteFare` (TAXI), a `PricingRule` TAXI with `baseFare 1.75`, and the setting `monthlyFeeTaxiUsd = 33`. Run the migration script **twice**, then assert: `VehicleType` has TAXI and TUKTUK; TAXI `baseFare` = 1.75 and `monthlyFeeUsd` = 33; the ride still has `vehicleType = 'TUKTUK'`; `information_schema.KEY_COLUMN_USAGE` shows an FK from `Ride.vehicleType` to `VehicleType.code`; table `PricingRule` is gone. Print `Migration check passed.`

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npm run test:migrate-vehicle-types`
Expected: FAIL — `scripts/migrate-vehicle-types.ts` missing

- [ ] **Step 3: Implement `migrate-vehicle-types.ts`** per the algorithm (reads `DATABASE_URL`; the check script passes it in `env`).

- [ ] **Step 4: Run the check**

Run: `cd backend && npm run test:migrate-vehicle-types`
Expected: `Migration check passed.`

- [ ] **Step 5: README + commit**

```bash
git add backend/scripts backend/package.json backend/README.md
git commit -m "feat(backend): re-runnable vehicle types migration"
```

---

### Task 4: Admin panel — Vehicle types page

**Files:**
- Create: `admin/src/pages/VehicleTypesPage.tsx`, `admin/src/components/VehicleBadge.tsx`
- Delete: `admin/src/pages/PricingPage.tsx`
- Modify: `admin/src/App.tsx` (route `vehicle-types`; `pricing` → `<Navigate to="/vehicle-types" replace />`), `admin/src/components/AppLayout.tsx` (nav item "Vehicle types" replaces "Pricing", same position), `admin/src/api/types.ts`, `admin/src/api/endpoints.ts`, `admin/src/lib/queries.ts`, `admin/src/components/StatusBadge.tsx` (drop TAXI/TUKTUK), `admin/src/pages/RouteFaresPage.tsx`, `admin/src/pages/SettingsPage.tsx`, `admin/src/pages/BillingAccountPage.tsx`, `admin/src/pages/DriversPage.tsx`, `admin/src/pages/RidesPage.tsx`

**Interfaces:**
- Consumes: Task 2 endpoints and `AdminVehicleType` shape.
- Produces:
  - `types.ts`: `VehicleType = string`; `VEHICLE_ICONS = ['CAR','TUKTUK','MOTORCYCLE','VAN','BUS'] as const`; `VehicleIcon`; `AdminVehicleType`; `VehicleTypeInput`; `VehicleSummary`; `vehicle: VehicleSummary` on `Ride` and `DriverProfile`. Remove `VEHICLE_TYPES`, `VehiclePricing`, the two fee fields on `Settings`.
  - `adminApi.vehicleTypes()`, `createVehicleType(body)`, `updateVehicleType(code, body)`, `deleteVehicleType(code)`; remove `pricing` / `updatePricing`.
  - `keys.vehicleTypes` replaces `keys.pricing`; `useVehicleTypes()` hook.
  - `<VehicleBadge code={string} />` — looks the code up in `useVehicleTypes()`, shows `nameEn`, colour by icon (CAR yellow, TUKTUK grape, MOTORCYCLE orange, VAN cyan, BUS indigo); falls back to the raw code while loading.

- [ ] **Step 1: Build the page.** Follow `PlacesPage.tsx` (table + modal form + delete confirm). Columns: order, name (EN / AR), icon, capacity, pricing mode, min fare, monthly fee, drivers, active switch. The form holds every field from Task 2's POST body. Code is uppercased as typed, shows the format rule, and is read-only when editing. Move the Calculated / Fixed route `Alert` text from `PricingPage.tsx` onto the page. The delete error `VEHICLE_TYPE_IN_USE` shows the server message via the existing `useApiMutation` notifications. Turning off a type with `driverCount > 0` asks for confirmation: "N drivers use this type and won't get rides while it's off."

- [ ] **Step 2: Port the other pages.** Route fares: type filter and form select from `useVehicleTypes()` (all types, inactive labelled "(off)"), badges via `VehicleBadge`. Settings: remove the two fee inputs and keys. Billing account: replace the "Taxi $X, Tuk-tuk $Y" sentence with the driver's type fee from `useVehicleTypes()`. Drivers and rides pages: `StatusBadge value={…vehicleType}` → `VehicleBadge`.

- [ ] **Step 3: Verify build and lint**

Run: `cd admin && npm run build && npm run lint`
Expected: both succeed with no errors

- [ ] **Step 4: Manual check against the dev backend** (`backend: npm run dev:db` + `npm run dev`, `admin: npm run dev`): `/pricing` redirects; six seeded types listed; create "Van 8" (`VAN_8`), edit its price, turn it off and on; deleting TAXI shows the in-use error; Route fares can pick `VAN_8`; Settings has no fee fields.

- [ ] **Step 5: Commit**

```bash
git add admin/src
git commit -m "feat(admin): vehicle types page replaces pricing"
```

---

### Task 5: Mobile app — vehicle types from the server

**Files:**
- Create: `mobile/src/lib/vehicles.ts`
- Modify: `mobile/src/api/types.ts`, `mobile/src/components/ride/RideBits.tsx`, `mobile/src/app/(passenger)/home.tsx`, `mobile/src/app/driver-apply.tsx`, `mobile/src/app/(driver)/dashboard.tsx`, `mobile/src/components/lists.tsx`, `mobile/src/i18n/en.json`, `mobile/src/i18n/ar.json`, `mobile/README.md`

**Interfaces:**
- Consumes: Task 1 response shapes (`vehicle: VehicleSummary` on estimates, rides, driver profiles; `/config.vehicleTypes[]`).
- Produces:
  - `types.ts`: `VehicleType = string`; `VehicleIcon`; `VehicleSummary`; `vehicle: VehicleSummary` on `Ride`, `RideEstimate`, driver profile; `VehicleTypeConfig` = `/config` item shape. `AppConfig` drops nothing (old fields stay optional, unused).
  - `vehicles.ts`: `vehicleName(v: VehicleSummary, lang: string): string` (Arabic when `lang === 'ar'`, else English); `VehicleIconView({ icon, size, color })`, which renders `MaterialCommunityIcons` from `@expo/vector-icons` — CAR `car`, TUKTUK `rickshaw`, MOTORCYCLE `motorbike`, VAN `van-passenger`, BUS `bus`, anything else `car`.
  - Remove `vehicleIcon()` from RideBits and the `vehicle.*` i18n keys. Add `ride.upTo` ("up to {{count}} passengers" / "حتى {{count}} ركاب") and `ride.noVehicles` ("No vehicles available right now" / "لا توجد مركبات متاحة حالياً").

- [ ] **Step 1: Implement `vehicles.ts`** and replace every `t(\`vehicle.${…}\`)` and `vehicleIcon(…)` with `vehicleName(x.vehicle, i18n.language)` / `<VehicleIconView icon={x.vehicle.icon} />`. Use `grep -rn "vehicle\.\${\|vehicleIcon" mobile/src` to find them; it must return nothing at the end.

- [ ] **Step 2: EstimateCard** shows the name, icon, and `t('ride.upTo', { count: estimate.vehicle.capacity })` under the distance line.

- [ ] **Step 3: Passenger home.** The initial `vehicle` state is `null`, set to the first estimate when estimates load (the existing effect at `home.tsx:110`). When `estimates` is an empty array, show `t('ride.noVehicles')` in place of the cards and disable Request (Review Focus 2).

- [ ] **Step 4: Driver apply.** The `Segmented` with two hard-coded options becomes a list built from `config.vehicleTypes`, using a vertical selectable list because there can be many types (icon, name, "up to N"). The default is `prev?.vehicleType` if it's still active, else the first type. The fee shown is the selected type's `monthlyFeeUsd` (both `fee` lines). The status view shows `vehicleName(dp.vehicle, …)`.

- [ ] **Step 5: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: no errors

- [ ] **Step 6: Manual check** in Expo against the dev backend, in English and Arabic:
  - The confirm screen shows six cards with the right icons and "up to N".
  - Turn every type off in admin → refresh shows the empty message and Request is disabled.
  - Driver apply lists the types and the fee changes with the selection.
  - Ride history shows the name of a type that has since been turned off.

- [ ] **Step 7: Commit**

```bash
git add mobile/src mobile/README.md
git commit -m "feat(mobile): vehicle types, names and icons from the server"
```
