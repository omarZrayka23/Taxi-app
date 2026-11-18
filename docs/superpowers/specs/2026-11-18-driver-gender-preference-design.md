# Driver gender preference — design

Date: 2026-11-18 · Status: approved

## Intent
Let passengers choose a **man or woman driver**. Target market is Tripoli / North Lebanon, a conservative
area where many women prefer women drivers, and women drivers prefer women passengers. Offering this is a
selling point against regular taxis and helps recruit women drivers.

## Goals
- Every user picks their gender (Man / Woman) when creating an account. Drivers are users, so the same
  field covers them; they don't choose again when applying.
- When requesting a ride, passengers see `Driver: [ Man ] [ Woman ]` under the vehicle choice.
  - Default = the passenger's own gender. Either can switch.
  - The row is shown only if at least one **approved woman driver is registered** in the app. Otherwise it is
    hidden and rides dispatch exactly as today (any driver).
  - If no woman driver of the chosen vehicle type is online near the pickup, the Woman button is greyed out
    with "No women drivers available now".
- A ride with a preference is offered **only** to drivers of that gender (initial dispatch and drivers
  coming online later).
- If a gender-preferred ride expires, the passenger sees a button to retry with the other gender.
- Admin panel shows each user's/driver's gender and can change it. Users cannot change it themselves
  (stops men switching to "woman" to get those rides).

## Non-goals
- No "Any" button (decided: two buttons only, see Approaches).
- Women drivers choosing "women passengers only" — good later idea, not in this change.
- Driver does not see the passenger's preference.

## Approaches
1. **Gender on User + preference on Ride (chosen).** One `gender` column on `User`, a `driverGender`
   column on `Ride`; dispatch filters by it. One field covers passengers and drivers, set once at sign-up.
2. Gender on DriverProfile only — rejected: the default depends on the passenger's gender, so passengers
   need it too; two fields would duplicate it for drivers.
3. With an "Any" button — rejected by the owner for Tripoli: two clear buttons match local expectations,
   and with "Man" as men's default, women drivers mostly get women passengers. Stuck rides are covered by
   the greyed-out button and the retry-after-expiry button.

## Constraints
- Stack: Express 5 + Prisma + MySQL backend, Expo app, React/Mantine admin. Arabic + English strings.
- The app has not launched; existing accounts are test data. `gender` is nullable in the DB for old rows,
  required on new sign-ups. Builder's call: users with no gender default to the Man selection; drivers with
  no gender receive only rides without a preference (admin should set it).
- Rides keep `driverGender` nullable: null = no preference (row hidden case), matches any driver.

## Left to the builder
- Exact API shape for "women drivers registered" and "woman driver nearby per vehicle type" (e.g. extend
  `/config` and `/rides/estimate`).
- Wording/translations, admin UI placement, tests.
