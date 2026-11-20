# Cedra — Admin panel

Web admin for the Cedra platform (taxi + tuk-tuk rides and car rental, Minieh / North Lebanon).

Stack: Vite + React 18 + TypeScript, react-router-dom v6, TanStack Query v5, Mantine v7, Tabler icons.
It talks to the backend described in [`../docs/API.md`](../docs/API.md).

## Setup

```bash
cd admin
npm install
cp .env.example .env   # then edit if the backend is not on localhost:4000
```

## Environment

| Variable       | Default                 | Meaning                                                                 |
| -------------- | ----------------------- | ----------------------------------------------------------------------- |
| `VITE_API_URL` | `http://localhost:4000` | Backend origin. API calls go to `${VITE_API_URL}/api`; uploaded files (`/uploads/...`) are loaded from `${VITE_API_URL}/uploads/...`. |

The value is baked in at build time (Vite env), so rebuild after changing it.

## Run

```bash
npm run dev       # dev server on http://localhost:5173
npm run build     # type-check (tsc -b) + production build into dist/
npm run preview   # serve the production build locally
npx tsc --noEmit -p tsconfig.app.json   # type-check only
```

The backend must allow CORS from the admin origin (e.g. `http://localhost:5173`).
`dist/` is a static single-page app: when hosting it, rewrite unknown paths to `index.html`.

## Signing in

Log in with the phone number and password of a user whose role is `ADMIN`
(phones may be typed as `03123456`, `3123456` or `+9613123456`). Non-admin accounts are refused.
The JWT is kept in `localStorage`; any `401` from the API signs you out and returns to `/login`.

## Pages

- **Dashboard** — `/admin/stats` cards.
- **Drivers** — filter by status + search; drawer with profile, vehicle, documents, balance, subscription; approve / reject / suspend / reactivate.
- **Car owners** — list by status; drawer with documents; approve / reject.
- **Rental listings** — review tab (all owners' listings, approve / reject, photos) and **Platform cars** tab (the admin's own fleet via `/owner/listings`: create, edit, activate/deactivate, upload/delete photos).
- **Rides** — status filter, detail drawer with timeline, admin cancel for active rides.
- **Rental bookings** — status filter and detail drawer; for platform cars the admin can confirm / reject / start / complete (via `/owner/bookings/*`).
- **Pricing** — per vehicle type: Calculated vs Fixed route + fare parameters.
- **Places** — CRUD for named areas (lat/lng/radius, active).
- **Route fares** — CRUD for fixed prices between places, with LBP equivalent.
- **Billing** — accounts with balances; account page with ledger, record payment, activate subscription months, adjustments.
- **Users** — search, block / unblock.
- **Settings** — all `/admin/settings` fields.

## Code layout

```
src/
  api/types.ts       Types + enums from the API contract
  api/client.ts      fetch wrapper (JWT, ApiError with code/message, 401 → logout)
  api/endpoints.ts   One function per endpoint used by the panel
  auth/              Auth context (login, logout, admin-only guard)
  components/        App shell, DataTable/PaginatedTable, drawers' building blocks, modals
  lib/               Formatting ($12.50, 1,500,000 LBP), notifications/mutation helper, shared queries
  pages/             One file per page
```
