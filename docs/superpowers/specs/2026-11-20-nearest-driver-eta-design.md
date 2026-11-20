# Nearest driver ETA on the estimate screen — design

Date: 2026-11-20 · Status: approved

## Intent
Before requesting, the rider sees how far the nearest driver is for each vehicle type ("Nearest driver ~4 min"),
or "No drivers nearby". Today the rider gets no signal: with no driver in range they tap Request, wait ~60 s,
and the ride just expires. Seeing a close car also builds trust that the service is live.

## Goals
- `POST /rides/estimate` returns, per vehicle type, `nearestDriverMin: number | null` — minutes for the nearest
  available driver (any gender) to reach the pickup; `null` when none is within the search radius.
- Each vehicle card on the rider's confirm screen shows "Nearest driver ~X min" or "No drivers nearby"
  (English + Arabic).
- The estimate refreshes every 30 s while the rider is on the confirm screen, so the minutes stay current.

## Non-goals
- No driver car icons on the map; no driver positions are sent to riders.
- The Man/Woman row is unchanged (still driven by `womanDriverNearby`); the ETA is for any driver.

## Approaches
- **No driver nearby → warn but still allow the request (chosen by owner, option A).** A driver who comes online
  within the offer window still gets the ride via `offerOpenRidesToDriver`.
- Disable the Request button when no driver is nearby — rejected: blocks rides that might have been picked up.
- ETA via the configured routing provider (Google/OSRM) — rejected: Google is billed per call, and this would add
  one call per vehicle type every time the screen opens or refreshes. Using the offline `estimateRoute`
  (haversine × 1.35 road factor at 30 km/h) instead — free and instant; precision of "~X min" is enough.

## Constraints
- Reuse `findAvailableDrivers` (same rules as dispatch: approved, online, fresh location, idle, within
  `searchRadiusKm`, matching vehicle type) so "nearby" on screen means the same as "will receive the offer".
- Minutes are rounded up, minimum 1.

## Left to the builder
- Exact helper name/shape in `services/rides.ts`, UI placement inside `EstimateCard`, wording, tests.
