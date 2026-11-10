# Minieh Rides

Taxi, tuk-tuk and car-rental platform for Minieh / North Lebanon, built to expand to all of Lebanon.

| Folder | What | Stack |
|---|---|---|
| [backend/](backend/) | REST API + realtime | Express 5, TypeScript, Prisma, MySQL 8, Socket.IO |
| [admin/](admin/) | Admin panel (approvals, pricing, places & route prices, billing, settings) | React 18, Vite, Mantine |
| [mobile/](mobile/) | One app for passengers, drivers and car owners (Arabic/English) | Expo / React Native |
| [docs/API.md](docs/API.md) | API contract shared by all three | |

## Run everything locally

1. **Backend** — see [backend/README.md](backend/README.md): create the MySQL database, `cp .env.example .env`, `npm install`, `npx prisma migrate dev --name init`, `npm run seed`, `npm run dev`.
2. **Admin** — `cd admin && cp .env.example .env && npm install && npm run dev` → http://localhost:5173, log in with the seeded admin.
3. **Mobile** — see [mobile/README.md](mobile/README.md): set `EXPO_PUBLIC_API_URL` to your computer's LAN IP (e.g. `http://192.168.1.20:4000`) and `npx expo start`.

## First things to do in the admin panel

1. **Places**: check the seeded town coordinates/radii (they are approximate) and add your neighbourhoods.
2. **Route prices**: set real street prices (Minieh → Tripoli, etc.) for taxi and tuk-tuk.
3. **Pricing**: choose Fixed route or Calculated per vehicle type and set the per-km rates used as fallback.
4. **Settings**: commission %, monthly fees, LBP rate, max driver debt, support phone.
