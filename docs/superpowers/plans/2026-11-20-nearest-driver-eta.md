# Nearest Driver ETA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each vehicle card on the rider's confirm screen shows "Nearest driver ~X min" or "No drivers nearby" before the rider requests.

**Architecture:** `POST /rides/estimate` adds `nearestDriverMin: number | null` per vehicle type, computed from the first result of the existing `findAvailableDrivers` (same rules as dispatch, any gender) and the offline `estimateRoute`. The app shows it on `EstimateCard` and refetches the estimate every 30 s while on the confirm screen.

**Tech Stack:** Express 5 + Prisma + MySQL, vitest, e2e script (backend); Expo/React Native + TanStack Query v5 + i18next (mobile).

**Spec:** `docs/superpowers/specs/2026-11-20-nearest-driver-eta-design.md`

## Global Constraints

- Field name: `nearestDriverMin` on each estimate; `null` = no available driver within `searchRadiusKm`.
- ETA uses the offline `estimateRoute` only — never `getRoute` (Google is billed per call).
- Minutes are rounded up, minimum 1.
- "Nearby" must use `findAvailableDrivers` so it means exactly "would receive the offer" (gender = `null`, i.e. any).
- No driver positions in the response. Request button stays enabled when no driver is nearby.
- Every new string goes in both `mobile/src/i18n/en.json` and `mobile/src/i18n/ar.json`.

## Review Focus

1. Driver standing at the pickup (distance 0) → must show "~1 min", never "0 min". Unit test in Task 1.
2. No driver of that vehicle type online (TUKTUK in e2e) → `null`, card shows "No drivers nearby", Request still enabled. e2e in Task 1, manual in Task 2.
3. Pickup outside the search radius of every driver → `null`. e2e in Task 1.
4. The only nearby driver is busy on a ride → `null` (busy drivers don't get offers). e2e in Task 1.
5. 30 s background refetch must not replace the cards with the loading spinner or reset the rider's vehicle/gender choice. Manual check in Task 2.

---

### Task 1: Backend — `nearestDriverMin` on estimates

**Files:**
- Modify: `backend/src/services/routing.ts` (add `pickupEtaMin`)
- Modify: `backend/src/services/rides.ts` (add `nearestDriverMin`, near `isDriverNearby` at line 91)
- Modify: `backend/src/routes/rides.ts:31-41` (`POST /rides/estimate`)
- Modify: `docs/API.md` (estimate response field)
- Test: `backend/tests/pricing.test.ts`, `backend/scripts/e2e.ts`

**Interfaces:**
- Produces: `pickupEtaMin(driver: LatLng, pickup: LatLng): number` (routing.ts); `nearestDriverMin(point: LatLng, vehicleType: DriverProfile['vehicleType']): Promise<number | null>` (rides.ts); each item of `estimates` in the `/rides/estimate` response gains `nearestDriverMin: number | null`.

- [ ] **Step 1: Write the failing unit test** in `backend/tests/pricing.test.ts`

```ts
import { pickupEtaMin } from '../src/services/routing.js';

describe('pickupEtaMin', () => {
  it('is at least 1 minute even at the pickup', () => {
    expect(pickupEtaMin({ lat: 34.4497, lng: 35.8186 }, { lat: 34.4497, lng: 35.8186 })).toBe(1);
    expect(pickupEtaMin({ lat: 34.4507, lng: 35.8186 }, { lat: 34.4497, lng: 35.8186 })).toBe(1); // 0.3 min
  });
  it('rounds the offline estimate up', () => {
    expect(pickupEtaMin({ lat: 34.4367, lng: 35.8497 }, { lat: 34.4497, lng: 35.8186 })).toBe(9); // 8.63 min
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx vitest run tests/pricing.test.ts`
Expected: FAIL — `pickupEtaMin` is not exported.

- [ ] **Step 3: Implement `pickupEtaMin`** in `routing.ts`: `Math.max(1, Math.ceil(estimateRoute(driver, pickup).durationMin))`.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && npx vitest run tests/pricing.test.ts`
Expected: PASS.

- [ ] **Step 5: Add failing e2e assertions** in `backend/scripts/e2e.ts`

In the "ride: fixed route" block (after `offFar` at ~line 150; driver D is online at `minieh.lat + 0.001`, the only driver):

```ts
const etaOf = (e: any, v: string) => e.estimates.find((x: any) => x.vehicleType === v).nearestDriverMin;
assert.equal(etaOf(est, 'TAXI'), 1);
assert.equal(etaOf(est, 'TUKTUK'), null, 'no tuktuk driver online');
assert.equal(etaOf(offFar, 'TAXI'), null, 'pickup outside search radius');
```

Right after D next accepts a ride in that block (the first `POST /rides/:id/accept` by `D` following line 152), add:

```ts
const busyEst = await ok('POST', '/rides/estimate', P, { pickup: { lat: minieh.lat, lng: minieh.lng }, dropoff: { lat: tripoli.lat, lng: tripoli.lng } });
assert.equal(etaOf(busyEst, 'TAXI'), null, 'busy driver is not nearby');
```

Extend the block's `log(...)` line to mention `nearest-driver ETA`.

- [ ] **Step 6: Run e2e to verify it fails**

Run: `cd backend && npm run test:e2e`
Expected: FAIL at `etaOf(est, 'TAXI')` (undefined !== 1).

- [ ] **Step 7: Implement** `nearestDriverMin` in `rides.ts` (reads `searchRadiusKm` from `getSettings()`, takes `findAvailableDrivers(point, vehicleType, radius, null)[0]`, returns `pickupEtaMin(driverPos, point)` or `null`), and add `nearestDriverMin: await nearestDriverMin(body.pickup, e.vehicleType)` beside `womanDriverNearby` in the estimate route. Document the field in `docs/API.md` next to `womanDriverNearby`.

- [ ] **Step 8: Run all backend checks**

Run: `cd backend && npm run typecheck && npm test && npm run test:e2e`
Expected: all PASS, "All e2e scenarios passed."

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/routing.ts backend/src/services/rides.ts backend/src/routes/rides.ts backend/tests/pricing.test.ts backend/scripts/e2e.ts docs/API.md
git commit -m "feat(backend): nearest driver ETA on ride estimates"
```

---

### Task 2: Mobile — show ETA on vehicle cards

**Files:**
- Modify: `mobile/src/api/types.ts:144-155` (`RideEstimate`)
- Modify: `mobile/src/components/ride/RideBits.tsx:15-47` (`EstimateCard`)
- Modify: `mobile/src/app/(passenger)/home.tsx:98-103` (estimate query)
- Modify: `mobile/src/i18n/en.json`, `mobile/src/i18n/ar.json` (`ride` section)

**Interfaces:**
- Consumes: `nearestDriverMin: number | null` on each estimate (Task 1).
- Produces: `RideEstimate.nearestDriverMin: number | null`; i18n keys `ride.nearestDriver` (with `{{min}}`) and `ride.noDriversNearby`.

- [ ] **Step 1: Add the type and strings**
  - `RideEstimate.nearestDriverMin: number | null` with a one-line doc comment.
  - en: `"nearestDriver": "Nearest driver ~{{min}} min"`, `"noDriversNearby": "No drivers nearby right now"`.
  - ar: `"nearestDriver": "أقرب سائق على بعد ~{{min}} د"`, `"noDriversNearby": "لا يوجد سائقون قريبون حالياً"`.

- [ ] **Step 2: Show it in `EstimateCard`** — a `Txt variant="small"` line under the distance/duration line: `t('ride.nearestDriver', { min })` when not null, otherwise `t('ride.noDriversNearby')` in a muted/warning colour from the existing theme `colors`.

- [ ] **Step 3: Refresh while on the confirm screen** — add `refetchInterval: 30_000` to the estimate `useQuery` in `home.tsx` (existing `enabled` already limits it to the confirm step with no active ride). Do not change the Request button's `disabled` rule.

- [ ] **Step 4: Typecheck and lint**

Run: `cd mobile && npx tsc --noEmit && npx expo lint`
Expected: no errors.

- [ ] **Step 5: Manual check** (backend running with seed data, one TAXI driver online near the pickup)
  - TAXI card shows "Nearest driver ~N min"; TUKTUK card shows "No drivers nearby right now"; Request TUKTUK is still tappable.
  - Switch app to Arabic: both strings render.
  - Wait 30 s on the screen: cards update in place with no spinner, selected vehicle and Man/Woman choice unchanged.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/api/types.ts mobile/src/components/ride/RideBits.tsx "mobile/src/app/(passenger)/home.tsx" mobile/src/i18n/en.json mobile/src/i18n/ar.json
git commit -m "feat(mobile): show nearest driver ETA before requesting"
```
