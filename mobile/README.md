# Cedra – mobile app

React Native / Expo (SDK 58, expo-router, TypeScript) app for passengers, drivers (any vehicle type) and car owners.
It talks to the backend described in `../docs/API.md`.

## Features

- **Passenger**: map home with pickup pin and destination picker (places list with Arabic/English search or a pin on the map), estimates per admin-managed vehicle type (name, icon, capacity) (USD + LBP, "fixed price" badge), ride request → searching → driver assigned (live driver marker) → arrived → in progress → completed → 1–5 star rating. Handles EXPIRED and CANCELLED. The active ride is restored on app start. Ride history.
- **Rentals**: browse cars (place, dates, self-drive / with-driver filters), car details with photos, prices and deposit, date-range calendar (booked days blocked), live quote, booking request (prompts for a driver's licence upload on `LICENSE_REQUIRED`), my bookings with cancel, live `booking:update`.
- **Driver mode**: application form, document uploads, status (PENDING / REJECTED reason / SUSPENDED), online/offline toggle (handles `SUBSCRIPTION_REQUIRED`, `DEBT_LIMIT_EXCEEDED`, `NOT_APPROVED`), location sent every ~5 s over the socket while online, live ride offers (+ `/driver/offers` polling), accept, active ride flow (Arrived → Start → Complete "collect $X cash", cancel before start, Google Maps navigation), rate passenger, earnings/billing ledger, trip history.
- **Owner mode**: application (individual / agency) + documents, listing create/edit (self-drive and/or with-driver prices, deposit, min days, place), photos (up to 6), show/hide, booking requests with Confirm / Reject / Hand over / Mark returned.
- **Profile**: name, language (Arabic RTL default / English), mode switcher, driver/owner applications, documents, support phone, logout.

## Requirements

- Node.js **22.13+** recommended. Expo SDK 58 / React Native 0.88 declare `node >=22.13`; Node 20 currently works for `tsc` and `expo export` but prints engine warnings.
- Android emulator (Android Studio) or a phone with **Expo Go**, or a development build.
- The backend running on port 4000 (see `../backend`).

## Setup

```bash
cd mobile
npm install
cp .env.example .env      # then edit
npx expo start            # press "a" for Android emulator, or scan the QR code with Expo Go
```

### Environment (`.env`)

| Variable | Default | Notes |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://10.0.2.2:4000` | Server origin, no `/api` suffix. API base is `${EXPO_PUBLIC_API_URL}/api`, uploads are `${EXPO_PUBLIC_API_URL}/uploads/...`, Socket.IO uses the same origin. `10.0.2.2` is the host machine as seen from the Android emulator. On a physical device use your PC's LAN IP (e.g. `http://192.168.1.20:4000`) and make sure the firewall allows port 4000. |
| `GOOGLE_MAPS_API_KEY` | empty | Needed for Android **development/production builds** (passed to the `react-native-maps` config plugin in `app.config.ts`). Not needed in Expo Go. |
| `EAS_PROJECT_ID` | empty | Needed to obtain an Expo push token in dev/production builds. Without it, push registration is skipped silently. |

`EXPO_PUBLIC_*` values are inlined at bundle time, so restart `npx expo start -c` after changing them.

## Running

- **Expo Go** (quickest): `npx expo start`, then open the project in Expo Go. Maps, location, image/document pickers and secure storage all work. Remote push notifications do **not** work in Expo Go on Android (SDK 53+), so the app skips push registration there. Expo Go can also reset the RTL setting when it opens a project. If the layout direction looks wrong after switching language, reload the app.
- **Development build** (full features, including push notifications and a forced RTL layout):
  ```bash
  npx expo run:android          # local build, needs Android SDK
  # or
  npx eas-cli@latest build --profile development --platform android
  ```

## Google Maps key (react-native-maps)

On Android, react-native-maps uses the Google Maps SDK:
1. In Google Cloud Console, enable **Maps SDK for Android** and create an API key. Restrict it to package `com.cedra.app` and your signing certificate SHA-1.
2. Put it in `.env` as `GOOGLE_MAPS_API_KEY=...`.
3. Rebuild the native app (`npx expo run:android` / EAS build). Config plugins only apply at build time.

iOS uses Apple Maps by default, so it needs no key.

## Languages / RTL

Arabic is the default language. The choice is stored in SecureStore and synced to the backend via `PATCH /me`. When the direction changes, the app calls `I18nManager.forceRTL` and reloads: it tries `expo-updates` `reloadAsync()` first, falls back to `DevSettings.reload()` in development, and otherwise asks the user to restart. All strings are in `src/i18n/ar.json` and `src/i18n/en.json`.

## Project layout

```
app.config.ts          Expo config (permissions, plugins, Maps key from env)
src/app/               expo-router routes
  (auth)/              welcome, login, register, verify (OTP), language
  (passenger)/         tabs: home (ride map), rentals, activity, profile
  (driver)/            tabs: dashboard, earnings, trips, driver-profile
  (owner)/             tabs: listings, requests, owner-profile
  rental/[id]          car details + booking
  booking/[id]         booking details (renter or owner view)
  driver-ride/[id]     driver's active ride
  driver-apply, owner-apply, documents, listing-edit/[id]
src/api/               typed client (types.ts mirrors API.md), endpoints, react-query keys
src/realtime/socket.ts Socket.IO connection; routes events into react-query / zustand
src/store/             zustand stores (auth/session/mode, rides/offers)
src/components/        UI kit and shared components
src/i18n/              i18next setup + ar/en strings
src/lib/               formatting, phone normalisation, location, files, push, links
```

## Checks

```bash
npx tsc --noEmit
npx expo export --platform android
npx expo-doctor
```
