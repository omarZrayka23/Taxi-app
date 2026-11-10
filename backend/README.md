# Minieh Rides — Backend API

Express 5 + TypeScript + Prisma (MySQL 8) + Socket.IO. The contract is in [../docs/API.md](../docs/API.md).

## Setup

1. Install MySQL 8 (e.g. MySQL Installer for Windows, XAMPP/MariaDB 10.6+, or Docker) and create a database:
   ```sql
   CREATE DATABASE minieh_rides CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
2. Configure and install:
   ```bash
   cp .env.example .env      # set DATABASE_URL, JWT_SECRET, ADMIN_PHONE, ADMIN_PASSWORD
   npm install
   npx prisma migrate dev --name init   # creates tables (use `npm run db:push` for quick prototyping)
   npm run seed                          # admin user, settings, pricing, North Lebanon places & route prices
   npm run dev                           # http://localhost:4000/api
   ```
   Log in to the admin panel with `ADMIN_PHONE` / `ADMIN_PASSWORD`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | API with auto-reload |
| `npm run build` / `npm start` | Compile to `dist/` and run in production |
| `npm test` | Unit tests (pricing, phone numbers, rental dates) |
| `npm run test:e2e` | Full end-to-end scenario against a throwaway MySQL (downloads MySQL on first run, ~1–3 min) |
| `npm run typecheck` | TypeScript check |
| `npm run seed` | Idempotent seed; never overwrites values the admin changed |

## How it works

- **Pricing** (`src/services/pricing.ts`, pure + tested): per vehicle type the admin picks `CALCULATED` (base + km + minutes, minimum, rounded up to `fareRoundingUsd`) or `FIXED_ROUTE` (admin price between two Places, falling back to calculated).
- **Distance**: `ROUTING_PROVIDER=haversine` (offline estimate, default), `osrm` (free OSRM server) or `google` (Distance Matrix, needs `GOOGLE_MAPS_API_KEY`). Any provider failure falls back to the estimate.
- **Dispatch** (`src/services/rides.ts`): new rides are offered over Socket.IO + Expo push to the 10 nearest online, approved, idle drivers within `searchRadiusKm`; first accept wins (atomic conditional update). A sweeper expires unaccepted rides after `offerTimeoutSec`.
- **Driver billing** (`src/services/billing.ts`): ledger per user. Commission-plan drivers are charged `commissionPercent` per completed ride; monthly-plan drivers need an active subscription (admin activates months, fee is charged to the ledger). Drivers above `maxDebtUsd` can't go online or accept rides until the admin records a payment (cash / Whish / OMT).
- **Rentals** (`src/services/rentals.ts`): owners (individual / agency / platform) list cars for self-drive and/or with-driver; bookings lock the listing row to prevent double booking; self-drive requires an uploaded driving license; owner commission on completion.
- **Uploads** are stored in `uploads/` and served at `/uploads/*`. For production, put them on S3/R2 or a persistent volume.

## Production checklist

- Strong `JWT_SECRET`, `NODE_ENV=production`, `CORS_ORIGINS` = admin domain.
- Replace the OTP stub in `src/routes/auth.ts` (`/otp/request`) with an SMS/WhatsApp provider.
- Run behind HTTPS (nginx/Caddy) with WebSocket upgrade enabled for `/socket.io`.
- Use `prisma migrate deploy` for schema changes; back up MySQL daily.
- Single API instance is assumed (in-process sweeper, Socket.IO rooms). To scale horizontally add the Socket.IO Redis adapter and run the sweeper in one instance.
