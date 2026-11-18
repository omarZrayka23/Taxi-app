# Driver Gender Preference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every user has a gender (Man/Woman); passengers can ask for a man or woman driver, and rides are offered only to drivers of the requested gender.

**Architecture:** A nullable `gender` column on `User` (set at sign-up, changeable only by admin) and a nullable `driverGender` column on `Ride` (null = no preference). Dispatch, late offers and accept all filter by it. `/rides/estimate` tells the app whether any woman driver is registered and whether one is nearby per vehicle type, so the app can show/grey the Man/Woman row.

**Tech Stack:** Express 5 + Prisma 6 + MySQL (backend), Expo/React Native (mobile, Arabic+English), React 18 + Mantine (admin).

**Spec:** `docs/superpowers/specs/2026-11-18-driver-gender-preference-design.md`

## Global Constraints

- Enum values everywhere: `Gender = 'MALE' | 'FEMALE'`. Field names: `User.gender`, `Ride.driverGender`.
- Two buttons only — no "Any" option in the passenger UI.
- Users cannot change their own gender (`PATCH /me` must not accept it); only `PATCH /admin/users/:id` can.
- `gender` is required on `POST /auth/register`; DB column stays nullable (old test accounts).
- Ride with `driverGender = null` matches any driver; ride with a value matches only drivers whose `user.gender` equals it. Drivers with `gender = null` get only null-preference rides.
- The project has no migrations folder; schema changes are applied with `npx prisma db push` and `npm run generate`.
- Every new user-facing string goes in both `mobile/src/i18n/en.json` and `mobile/src/i18n/ar.json`.

## Review Focus

1. A man driver calling `POST /rides/:id/accept` directly on a woman-only ride (not offered to him) → must get `RIDE_NOT_AVAILABLE`. Test in Task 2.
2. A woman driver who comes online *after* a woman-only ride was requested → must receive the offer; a man coming online must not. Test in Task 2.
3. No approved woman driver registered → `hasWomenDrivers: false`, app hides the row and sends no `driverGender`. Test in Task 2 (API) and checked manually in Task 4.
4. Woman passenger whose default (Woman) is greyed out → selection auto-switches to Man so she can still request. Manual check in Task 4.
5. A pending/rejected or blocked woman driver must not count toward `hasWomenDrivers` or `womanDriverNearby`. Test in Task 2.

---

### Task 1: Gender on users (backend)

**Files:**
- Modify: `backend/prisma/schema.prisma` (add `enum Gender`, `User.gender`, `Ride.driverGender`)
- Modify: `backend/src/routes/auth.ts:38-59` (register)
- Modify: `backend/src/services/serializers.ts:70-82` (`serializeUser`), `:98+` (`serializeRide`)
- Modify: `backend/src/routes/admin/manage.ts:88-96` (`PATCH /admin/users/:id`)
- Test: `backend/scripts/e2e.ts`

**Interfaces:**
- Produces: Prisma `enum Gender { MALE FEMALE }`; `User.gender Gender?`; `Ride.driverGender Gender?`; `serializeUser(u).gender: 'MALE'|'FEMALE'|null`; `serializeRide(r).driverGender: 'MALE'|'FEMALE'|null`; `PATCH /admin/users/:id` body `{ status?: 'ACTIVE'|'BLOCKED', gender?: 'MALE'|'FEMALE' }` (at least one required).

- [ ] **Step 1: Update e2e for the new register contract**

In `backend/scripts/e2e.ts`, change the `reg` helper to `reg(name, phone, gender: 'MALE'|'FEMALE' = 'MALE')` sending `gender`. After the existing register block add:

```ts
await fails('VALIDATION_ERROR', 'POST', '/auth/register', undefined, { name: 'No Gender', phone: '03999999', password: 'secret1' });
assert.equal((await ok('GET', '/auth/me', P)).user.gender, 'MALE');
await ok('PATCH', '/me', P, { gender: 'FEMALE' }); // unknown key is stripped by zod
assert.equal((await ok('GET', '/auth/me', P)).user.gender, 'MALE');
log('register requires gender; user cannot change own gender');
```

After admin login is available (same block), add an admin gender change on the owner account `O` and assert `user.gender === 'FEMALE'`, then set it back to `'MALE'`.

- [ ] **Step 2: Run e2e to verify it fails**

Run: `cd backend && npm run test:e2e`
Expected: FAIL — register without gender returns 201 instead of `VALIDATION_ERROR`.

- [ ] **Step 3: Implement**

- Schema: add the enum and the two nullable fields (no new index).
- Register zod: `gender: z.enum(['MALE','FEMALE'])`, saved on create.
- `serializeUser` adds `gender`; `serializeRide` adds `driverGender`.
- Admin PATCH: body `z.object({ status: ..optional(), gender: z.enum([...]).optional() }).refine(b => b.status || b.gender)`; keep `CANNOT_BLOCK_SELF` only when `status` is provided; keep the go-offline side effect only when `status === 'BLOCKED'`.
- Run `npx prisma db push && npm run generate` against the dev DB.

- [ ] **Step 4: Run checks**

Run: `cd backend && npm run typecheck && npm test && npm run test:e2e`
Expected: all PASS, new log line printed.

- [ ] **Step 5: Commit**

```bash
git add backend && git commit -m "feat(backend): user gender, set at sign-up and by admin"
```

### Task 2: Gender-aware dispatch and availability (backend)

**Files:**
- Modify: `backend/src/services/rides.ts:42-110` (`findAvailableDrivers`, `dispatchRide`, `offerOpenRidesToDriver`)
- Modify: `backend/src/routes/rides.ts:28-69` (estimate, create), `:120-134` (accept)
- Test: `backend/scripts/e2e.ts`

**Interfaces:**
- Consumes: Task 1 fields.
- Produces:
  - `findAvailableDrivers(point, vehicleType, radiusKm, gender: Gender | null)` — when `gender` is set, adds `user.gender = gender` to the existing `user` filter.
  - `export async function hasWomenDrivers(): Promise<boolean>` — exists a `DriverProfile` with `status: 'APPROVED'` and `user: { gender: 'FEMALE', status: 'ACTIVE' }`.
  - `export async function isDriverNearby(point: LatLng, vehicleType, gender: Gender): Promise<boolean>` — `findAvailableDrivers(...).length > 0` with `settings.searchRadiusKm`.
  - `POST /rides/estimate` → `{ estimates: (Estimate & { womanDriverNearby: boolean })[], hasWomenDrivers: boolean }`.
  - `POST /rides` body gains `driverGender?: 'MALE'|'FEMALE'`; stored on the ride (null when omitted).

- [ ] **Step 1: Write the failing e2e scenario**

Add a `// ---------- driver gender ----------` block after the "monthly driver / expiry" block (driver `D` is online, MALE, TAXI, MONTHLY). Register `W = reg('Driver Wafa', '71444444', 'FEMALE')` and `WP = reg('Passenger Rana', '03555555', 'FEMALE')`. Assert, in order:

```ts
let e = await ok('POST', '/rides/estimate', WP, { pickup: minieh, dropoff: tripoli });
assert.equal(e.hasWomenDrivers, false);
// W applies TAXI (MONTHLY plan + admin subscription so she can go online), admin approves
e = await ok('POST', '/rides/estimate', WP, { pickup: minieh, dropoff: tripoli });
assert.equal(e.hasWomenDrivers, true);
assert.equal(e.estimates.find((x: any) => x.vehicleType === 'TAXI').womanDriverNearby, false); // W offline

// Woman-only ride while W is offline: D (man) gets no offer and cannot accept
const rw = (await ok('POST', '/rides', WP, { vehicleType: 'TAXI', driverGender: 'FEMALE', pickup: {...minieh, address:'A'}, dropoff: {...tripoli, address:'B'} })).ride;
assert.equal(rw.driverGender, 'FEMALE');
assert.equal((await ok('GET', '/driver/offers', D)).rides.length, 0);
await fails('RIDE_NOT_AVAILABLE', 'POST', `/rides/${rw.id}/accept`, D);

// W comes online later and receives the open ride
const wSock = await connect(W);
const wOffer = nextEvent(wSock, 'ride:offer');
await ok('POST', '/driver/online', W, { lat: minieh.lat, lng: minieh.lng });
assert.equal((await wOffer).ride.id, rw.id);
assert.equal((await ok('POST', '/rides/estimate', WP, { pickup: minieh, dropoff: tripoli })).estimates.find((x: any) => x.vehicleType === 'TAXI').womanDriverNearby, true);
await ok('POST', `/rides/${rw.id}/accept`, W);   // then arrived/start/complete to free W

// Man-only ride: W gets no offer and cannot accept
const rm = (await ok('POST', '/rides', WP, { vehicleType: 'TAXI', driverGender: 'MALE', ... })).ride;
await fails('RIDE_NOT_AVAILABLE', 'POST', `/rides/${rm.id}/accept`, W);
// cancel rm

// Blocked woman driver no longer counts
await ok('PATCH', `/admin/users/${wUserId}`, admin, { status: 'BLOCKED' });
assert.equal((await ok('POST', '/rides/estimate', WP, { pickup: minieh, dropoff: tripoli })).hasWomenDrivers, false);
log('gender: availability flags, woman-only/man-only dispatch, late online offer, accept guard, blocked excluded');
```

Update `assert.equal((await ok('GET', '/rides', P)).total, 4)` only if the block uses `P`; it uses `WP`, so leave it.

- [ ] **Step 2: Run e2e to verify it fails**

Run: `cd backend && npm run test:e2e`
Expected: FAIL at `e.hasWomenDrivers` (undefined).

- [ ] **Step 3: Implement**

- `findAvailableDrivers` gets the `gender` param; `dispatchRide` passes `ride.driverGender`.
- `offerOpenRidesToDriver`: load the driver's `gender` (`prisma.user.findUnique({ where: { id: profile.userId }, select: { gender: true } })`) and add to the ride query: `OR: [{ driverGender: null }, ...(g ? [{ driverGender: g }] : [])]`.
- Accept: add the same `OR` to the `transitionRide` where-clause using `user.gender` (`me(req)` is the full Prisma `User`).
- Estimate: compute `hasWomenDrivers()` once and `isDriverNearby(pickup, type, 'FEMALE')` per estimate (skip nearby queries when `hasWomenDrivers` is false — return `false`).
- Create: zod `driverGender: z.enum(['MALE','FEMALE']).optional()`, saved as `driverGender ?? null`.

- [ ] **Step 4: Run checks**

Run: `cd backend && npm run typecheck && npm test && npm run test:e2e`
Expected: all PASS, gender log line printed.

- [ ] **Step 5: Update `docs/API.md`** for `gender` on register/user, `driverGender` on rides, the estimate fields, and the admin PATCH body.

- [ ] **Step 6: Commit**

```bash
git add backend docs/API.md && git commit -m "feat(backend): dispatch rides by requested driver gender"
```

### Task 3: Gender at sign-up (mobile)

**Files:**
- Modify: `mobile/src/api/types.ts` (`Gender`, `User.gender`, `Ride.driverGender`, `RideEstimate.womanDriverNearby`)
- Modify: `mobile/src/api/endpoints.ts:36-37,72-74` (register body, estimate response, `RideRequestInput.driverGender?`)
- Modify: `mobile/src/app/(auth)/register.tsx`
- Modify: `mobile/src/i18n/en.json`, `mobile/src/i18n/ar.json`

**Interfaces:**
- Produces: `export type Gender = 'MALE' | 'FEMALE'`; `ridesApi.estimate` returns `{ estimates: RideEstimate[]; hasWomenDrivers: boolean }`; i18n keys `gender.label`, `gender.MALE`, `gender.FEMALE`, `gender.required`.

- [ ] **Step 1: Implement**

Register screen: two-option selector (Man / Woman — reuse the selectable-chip style already used for vehicle choice in `home.tsx`) between phone and password, no default selected; submitting without a choice shows `gender.required` in the existing `errors` state. Strings — en: "I am" / "Man" / "Woman" / "Please choose"; ar: "أنا" / "رجل" / "امرأة" / "الرجاء الاختيار".

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Manual check** — `npx expo start`, register a new account without choosing → error shown; choose Woman → account created, `/auth/me` returns `gender: 'FEMALE'`.

- [ ] **Step 4: Commit**

```bash
git add mobile && git commit -m "feat(mobile): choose gender at sign-up"
```

### Task 4: Man/Woman driver choice when requesting (mobile)

**Files:**
- Modify: `mobile/src/app/(passenger)/home.tsx` (state ~L44, estimates ~L95-104, `requestRide` L167, `retryRide` L222, vehicle list ~L375-393, EXPIRED case ~L513-518)
- Modify: `mobile/src/i18n/en.json`, `mobile/src/i18n/ar.json`

**Interfaces:**
- Consumes: Task 3 types and estimate response.

- [ ] **Step 1: Implement**

- State `driverGender: Gender`, initial `user.gender ?? 'MALE'`.
- Under the vehicle list, when `estimates.data.hasWomenDrivers`: row `Driver: [Man] [Woman]`. Woman is disabled with hint `driver.noWomenNow` when the selected vehicle's `womanDriverNearby` is false; in that case, if `driverGender === 'FEMALE'`, switch it to `'MALE'` (effect on estimates/vehicle change).
- `requestRide` input gains `driverGender?: Gender`; sends it only when the row is shown.
- `retryRide(r, gender = r.driverGender)` passes `driverGender: gender ?? undefined`.
- EXPIRED case: when `ride.driverGender` is set, add a second button `ride.tryOtherGender` → `retryRide(ride, other)`. Wire through the existing `onRetry` prop pattern (add `onRetryOther`).
- Strings — en: `driver.label` "Driver", `driver.noWomenNow` "No women drivers available now", `ride.tryWithMan` "Try again with a man driver", `ride.tryWithWoman` "Try again with a woman driver"; ar: "السائق", "لا توجد سائقات متاحات الآن", "حاول مجدداً مع سائق رجل", "حاولي مجدداً مع سائقة امرأة".

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Manual check (Review Focus 3 & 4)** — with no approved woman driver: row hidden. Approve a woman driver, keep her offline: row shown, Woman greyed, woman passenger's selection shows Man. Bring her online: Woman enabled and default for the woman passenger; request → only she gets the offer. Let a woman-only ride expire → "Try again with a man driver" works.

- [ ] **Step 4: Commit**

```bash
git add mobile && git commit -m "feat(mobile): passengers choose man or woman driver"
```

### Task 5: Gender in the admin panel

**Files:**
- Modify: `admin/src/api/types.ts:128-140` (`Gender`, `User.gender`), `admin/src/api/endpoints.ts:59` (add `setUserGender(id, gender)` → `PATCH /admin/users/:id { gender }`)
- Modify: `admin/src/pages/UsersPage.tsx` (Gender column with a Mantine `Select` Man/Woman/— calling `setUserGender`, success toast)
- Modify: `admin/src/pages/DriversPage.tsx` (show gender badge in list and detail; driver rows' `user` must include gender → extend `userSummary` usage in `serializeDriverRow` in `backend/src/routes/admin/manage.ts` with `gender: d.user.gender`)

- [ ] **Step 1: Implement** as listed.

- [ ] **Step 2: Build and lint**

Run: `cd admin && npm run build && npm run lint` and `cd backend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Manual check** — change a user's gender in Users page; it shows on Drivers page and `/auth/me` for that user.

- [ ] **Step 4: Commit**

```bash
git add admin backend && git commit -m "feat(admin): view and change user gender"
```
