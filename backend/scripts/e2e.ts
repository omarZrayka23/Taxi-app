/**
 * End-to-end smoke test against a real, throwaway MySQL server (downloaded on first run).
 * Run: npm run test:e2e
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createDB } from 'mysql-memory-server';
import { io as ioClient, type Socket } from 'socket.io-client';

const log = (msg: string) => console.log(`  ✓ ${msg}`);

async function main() {
  console.log('Starting throwaway MySQL…');
  const db = await createDB({ logLevel: 'ERROR' });
  const env = {
    ...process.env,
    DATABASE_URL: `mysql://${db.username}@127.0.0.1:${db.port}/${db.dbName}`,
    NODE_ENV: 'test',
    ADMIN_PHONE: '70000000',
    ADMIN_PASSWORD: 'admin123',
    UPLOAD_DIR: 'uploads-e2e',
  };
  Object.assign(process.env, env);
  execSync('npx prisma db push --skip-generate', { env, stdio: 'inherit' });
  execSync('npx tsx prisma/seed.ts', { env, stdio: 'inherit' });

  // Import after env is set so config/prisma pick up the test database.
  const { createApp } = await import('../src/app.js');
  const { initRealtime } = await import('../src/services/realtime.js');
  const { expireStaleRides } = await import('../src/services/rides.js');
  const { prisma } = await import('../src/db.js');

  const server = http.createServer(createApp());
  initRealtime(server);
  await new Promise<void>((r) => server.listen(0, r));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const sockets: Socket[] = [];

  async function call(method: string, path: string, token?: string, body?: unknown) {
    const isForm = body instanceof FormData;
    const res = await fetch(`${origin}/api${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    const json = (await res.json()) as any;
    return { status: res.status, body: json };
  }
  const ok = async (method: string, path: string, token?: string, body?: unknown) => {
    const r = await call(method, path, token, body);
    assert.ok(r.status < 300, `${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const fails = async (code: string, method: string, path: string, token?: string, body?: unknown) => {
    const r = await call(method, path, token, body);
    assert.equal(r.body?.error?.code, code, `${method} ${path} expected ${code}, got ${r.status} ${JSON.stringify(r.body)}`);
    return r;
  };
  const connect = (token: string) =>
    new Promise<Socket>((resolve, reject) => {
      const s = ioClient(origin, { auth: { token }, transports: ['websocket'] });
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
      sockets.push(s);
    });
  const nextEvent = <T = any>(s: Socket, event: string, timeoutMs = 3000) =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
      s.once(event, (p: T) => {
        clearTimeout(t);
        resolve(p);
      });
    });
  const upload = (type: string, name = 'doc.png', mime = 'image/png') => {
    const fd = new FormData();
    fd.append('type', type);
    fd.append('file', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: mime }), name);
    return fd;
  };

  try {
    console.log('Running scenarios…');
    // ---------- basics ----------
    assert.deepEqual(await ok('GET', '/health'), { ok: true });
    await fails('NOT_FOUND', 'GET', '/nope');
    await fails('UNAUTHORIZED', 'GET', '/auth/me');
    const admin = (await ok('POST', '/auth/login', undefined, { phone: '+961 70 000 000', password: 'admin123' })).token;
    await fails('INVALID_CREDENTIALS', 'POST', '/auth/login', undefined, { phone: '70000000', password: 'x' });
    log('health, 404, auth errors, admin login');

    const reg = async (name: string, phone: string, gender: 'MALE' | 'FEMALE' = 'MALE') =>
      (await ok('POST', '/auth/register', undefined, { name, phone, password: 'secret1', gender })).token as string;
    const P = await reg('Passenger Pat', '03111111');
    const D = await reg('Driver Dan', '71222222');
    const O = await reg('Owner Omar', '76333333');
    await fails('PHONE_TAKEN', 'POST', '/auth/register', undefined, { name: 'Dup', phone: '+9613111111', password: 'secret1', gender: 'MALE' });
    await fails('VALIDATION_ERROR', 'POST', '/auth/register', undefined, { name: 'X', phone: '12', password: '1' });
    await fails('FORBIDDEN', 'GET', '/admin/stats', P);
    const otp = await ok('POST', '/auth/otp/request', P);
    assert.equal((await ok('POST', '/auth/otp/verify', P, { code: otp.devCode })).user.phoneVerified, true);
    log('register, duplicate phone, validation, admin guard, OTP');

    await fails('VALIDATION_ERROR', 'POST', '/auth/register', undefined, { name: 'No Gender', phone: '03999999', password: 'secret1' });
    assert.equal((await ok('GET', '/auth/me', P)).user.gender, 'MALE');
    await ok('PATCH', '/me', P, { gender: 'FEMALE' }); // unknown key is stripped by zod
    assert.equal((await ok('GET', '/auth/me', P)).user.gender, 'MALE');
    const oId = (await ok('GET', '/auth/me', O)).user.id;
    assert.equal((await ok('PATCH', `/admin/users/${oId}`, admin, { gender: 'FEMALE' })).user.gender, 'FEMALE');
    assert.equal((await ok('PATCH', `/admin/users/${oId}`, admin, { gender: 'MALE' })).user.gender, 'MALE');
    await fails('VALIDATION_ERROR', 'PATCH', `/admin/users/${oId}`, admin, {});
    log('register requires gender; user cannot change own gender; admin can');

    const config = await ok('GET', '/config');
    assert.equal(config.vehicleTypes.length, 2);
    const places = (await ok('GET', '/places')).places as any[];
    const minieh = places.find((p) => p.nameEn === 'Minieh');
    const tripoli = places.find((p) => p.nameEn === 'Tripoli');
    log(`config + ${places.length} places`);

    // ---------- driver onboarding ----------
    const applied = await ok('POST', '/driver/apply', D, {
      vehicleType: 'TAXI', vehicleMake: 'Mercedes', vehicleModel: 'E200', vehicleColor: 'White',
      plateNumber: 'T 123456', licenseNumber: 'L-1', billingPlan: 'COMMISSION',
    });
    assert.equal(applied.driverProfile.status, 'PENDING');
    await ok('POST', '/documents', D, upload('DRIVER_LICENSE'));
    await fails('NOT_APPROVED', 'POST', '/driver/online', D, { lat: minieh.lat, lng: minieh.lng });
    const pending = await ok('GET', '/admin/drivers?status=PENDING', admin);
    assert.equal(pending.total, 1);
    const detail = await ok('GET', `/admin/drivers/${pending.items[0].id}`, admin);
    assert.equal(detail.documents.length, 1);
    const dSock = await connect(D);
    const accountUpdate = nextEvent(dSock, 'account:update');
    await ok('POST', `/admin/drivers/${pending.items[0].id}/approve`, admin);
    assert.equal((await accountUpdate).user.driverProfile.status, 'APPROVED');
    await ok('POST', '/driver/online', D, { lat: minieh.lat + 0.001, lng: minieh.lng });
    log('driver apply → document → admin approve (socket account:update) → online');

    // ---------- ride: fixed route ----------
    const est = await ok('POST', '/rides/estimate', P, { pickup: { lat: minieh.lat, lng: minieh.lng }, dropoff: { lat: tripoli.lat, lng: tripoli.lng } });
    const taxiEst = est.estimates.find((e: any) => e.vehicleType === 'TAXI');
    assert.equal(taxiEst.pricingMode, 'FIXED_ROUTE');
    assert.equal(taxiEst.fareUsd, 5);
    assert.equal(taxiEst.fareLbp, 5 * config.lbpRate);
    const offFar = await ok('POST', '/rides/estimate', P, { pickup: { lat: 34.0, lng: 35.7 }, dropoff: { lat: 34.05, lng: 35.72 } });
    assert.equal(offFar.estimates[0].pricingMode, 'CALCULATED');
    log(`estimate Minieh→Tripoli = $${taxiEst.fareUsd} fixed; outside places = calculated $${offFar.estimates[0].fareUsd}`);

    const pSock = await connect(P);
    const offer = nextEvent(dSock, 'ride:offer');
    const ride = (
      await ok('POST', '/rides', P, {
        vehicleType: 'TAXI',
        pickup: { lat: minieh.lat, lng: minieh.lng, address: 'Minieh square' },
        dropoff: { lat: tripoli.lat, lng: tripoli.lng, address: 'Tripoli, Tell' },
      })
    ).ride;
    assert.equal((await offer).ride.id, ride.id);
    await fails('ACTIVE_RIDE_EXISTS', 'POST', '/rides', P, {
      vehicleType: 'TAXI', pickup: { lat: 1, lng: 1, address: 'a' }, dropoff: { lat: 1, lng: 1, address: 'b' },
    });
    assert.equal((await ok('GET', '/driver/offers', D)).rides.length, 1);
    log('ride requested → offer delivered to driver socket; second ride blocked');

    const accepted = nextEvent(pSock, 'ride:update');
    await ok('POST', `/rides/${ride.id}/accept`, D);
    const acc = (await accepted).ride;
    assert.equal(acc.status, 'ACCEPTED');
    assert.equal(acc.driver.plateNumber, 'T 123456');
    await fails('DRIVER_BUSY', 'POST', `/rides/${ride.id}/accept`, D);
    const loc = nextEvent(pSock, 'driver:location');
    dSock.emit('driver:location', { lat: 34.479, lng: 35.931 });
    assert.deepEqual(await loc, { rideId: ride.id, lat: 34.479, lng: 35.931 });
    await fails('INVALID_RIDE_STATE', 'POST', `/rides/${ride.id}/start`, D);
    await ok('POST', `/rides/${ride.id}/arrived`, D);
    await ok('POST', `/rides/${ride.id}/start`, D);
    await fails('INVALID_RIDE_STATE', 'POST', `/rides/${ride.id}/cancel`, P);
    const done = (await ok('POST', `/rides/${ride.id}/complete`, D)).ride;
    assert.equal(done.status, 'COMPLETED');
    assert.equal(done.commissionUsd, 0.5);
    await ok('POST', `/rides/${ride.id}/rate`, P, { stars: 5 });
    await fails('ALREADY_RATED', 'POST', `/rides/${ride.id}/rate`, P, { stars: 4 });
    await ok('POST', `/rides/${ride.id}/rate`, D, { stars: 4 });
    const me = await ok('GET', '/auth/me', D);
    assert.equal(me.user.driverProfile.ratingAvg, 5);
    log('accept → live location → arrived → start → complete ($0.50 commission) → ratings');

    // ---------- billing ----------
    let billing = await ok('GET', '/driver/billing', D);
    assert.equal(billing.balanceUsd, 0.5);
    await ok('PUT', '/admin/settings', admin, { maxDebtUsd: 0.1 });
    await fails('DEBT_LIMIT_EXCEEDED', 'POST', '/driver/online', D, { lat: minieh.lat, lng: minieh.lng });
    const dUserId = me.user.id;
    await ok('POST', `/admin/billing/accounts/${dUserId}/payments`, admin, { amountUsd: 0.5, method: 'WHISH' });
    await ok('POST', '/driver/online', D, { lat: minieh.lat, lng: minieh.lng });
    await ok('POST', '/driver/offline', D);
    await ok('PATCH', '/driver/profile', D, { billingPlan: 'MONTHLY' });
    await ok('PUT', '/admin/settings', admin, { maxDebtUsd: 50 });
    await fails('SUBSCRIPTION_REQUIRED', 'POST', '/driver/online', D, { lat: minieh.lat, lng: minieh.lng });
    const sub = await ok('POST', `/admin/billing/accounts/${dUserId}/subscription`, admin, { months: 1 });
    assert.equal(sub.subscription.active, true);
    assert.equal(sub.balanceUsd, 30);
    await ok('POST', '/driver/online', D, { lat: minieh.lat, lng: minieh.lng });
    billing = await ok('GET', '/driver/billing', D);
    assert.equal(billing.ledger.length, 3);
    const accounts = await ok('GET', '/admin/billing/accounts', admin);
    assert.ok(accounts.items.some((a: any) => a.user.id === dUserId && a.balanceUsd === 30));
    log('commission debt limit, payment, monthly plan, subscription gating, ledger');

    // ---------- monthly driver: no commission; expiry ----------
    const r2 = (await ok('POST', '/rides', P, {
      vehicleType: 'TAXI', pickup: { lat: minieh.lat, lng: minieh.lng, address: 'A' }, dropoff: { lat: tripoli.lat, lng: tripoli.lng, address: 'B' },
    })).ride;
    await ok('POST', `/rides/${r2.id}/accept`, D);
    await ok('POST', `/rides/${r2.id}/arrived`, D);
    await ok('POST', `/rides/${r2.id}/start`, D);
    assert.equal((await ok('POST', `/rides/${r2.id}/complete`, D)).ride.commissionUsd, 0);

    const r3 = (await ok('POST', '/rides', P, {
      vehicleType: 'TUKTUK', pickup: { lat: minieh.lat, lng: minieh.lng, address: 'A' }, dropoff: { lat: tripoli.lat, lng: tripoli.lng, address: 'B' },
    })).ride;
    assert.equal(r3.fareUsd, 3);
    await prisma.ride.update({ where: { id: r3.id }, data: { requestedAt: new Date(Date.now() - 10 * 60_000) } });
    const expired = nextEvent(pSock, 'ride:update');
    await expireStaleRides();
    assert.equal((await expired).ride.status, 'EXPIRED');
    const r4 = (await ok('POST', '/rides', P, {
      vehicleType: 'TAXI', pickup: { lat: minieh.lat, lng: minieh.lng, address: 'A' }, dropoff: { lat: tripoli.lat, lng: tripoli.lng, address: 'B' },
    })).ride;
    assert.equal((await ok('POST', `/rides/${r4.id}/cancel`, P, { reason: 'changed mind' })).ride.cancelledBy, 'PASSENGER');
    assert.equal((await ok('GET', '/rides', P)).total, 4);
    log('monthly driver pays no commission; unaccepted ride expires; passenger cancel; history');

    // ---------- rental ----------
    await fails('OWNER_NOT_APPROVED', 'POST', '/owner/listings', O, {});
    await ok('POST', '/owner/apply', O, { type: 'INDIVIDUAL' });
    const owners = await ok('GET', '/admin/owners?status=PENDING', admin);
    await ok('POST', `/admin/owners/${owners.items[0].id}/approve`, admin);
    const carBody = {
      make: 'Kia', model: 'Picanto', year: 2022, seats: 4, transmission: 'AUTOMATIC', fuelType: 'GASOLINE', color: 'Red',
      placeId: minieh.id, selfDrive: true, pricePerDayUsd: 30, withDriver: true, withDriverPricePerDayUsd: 50, depositUsd: 200, minDays: 2,
    };
    await fails('VALIDATION_ERROR', 'POST', '/owner/listings', O, { ...carBody, selfDrive: false, withDriver: false });
    const listing = (await ok('POST', '/owner/listings', O, carBody)).listing;
    assert.equal(listing.status, 'PENDING');
    const photos = new FormData();
    photos.append('photos', new Blob([Buffer.from('ffd8ffe0', 'hex')], { type: 'image/jpeg' }), 'car.jpg');
    assert.equal((await ok('POST', `/owner/listings/${listing.id}/photos`, O, photos)).listing.photos.length, 1);
    assert.equal((await ok('GET', '/rentals', P)).total, 0);
    await ok('POST', `/admin/listings/${listing.id}/approve`, admin);

    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const quote = await ok('POST', `/rentals/${listing.id}/quote`, P, { startDate: day(3), endDate: day(6), mode: 'SELF_DRIVE' });
    assert.deepEqual([quote.days, quote.totalUsd, quote.depositUsd], [3, 90, 200]);
    await fails('MIN_DAYS', 'POST', `/rentals/${listing.id}/quote`, P, { startDate: day(3), endDate: day(4), mode: 'SELF_DRIVE' });
    await fails('LICENSE_REQUIRED', 'POST', `/rentals/${listing.id}/book`, P, { startDate: day(3), endDate: day(6), mode: 'SELF_DRIVE' });
    await ok('POST', '/documents', P, upload('DRIVER_LICENSE', 'lic.pdf', 'application/pdf'));
    const oSock = await connect(O);
    const newBooking = nextEvent(oSock, 'booking:update');
    const booking = (await ok('POST', `/rentals/${listing.id}/book`, P, { startDate: day(3), endDate: day(6), mode: 'SELF_DRIVE' })).booking;
    assert.equal((await newBooking).booking.id, booking.id);
    await fails('NOT_AVAILABLE', 'POST', `/rentals/${listing.id}/book`, D, { startDate: day(5), endDate: day(8), mode: 'WITH_DRIVER' });
    await ok('POST', `/rentals/${listing.id}/book`, D, { startDate: day(6), endDate: day(8), mode: 'WITH_DRIVER' });
    assert.equal((await ok('GET', `/rentals?startDate=${day(4)}&endDate=${day(5)}`, P)).total, 0);
    assert.equal((await ok('GET', `/rentals?startDate=${day(10)}&endDate=${day(12)}`, P)).total, 1);
    assert.equal((await ok('GET', `/rentals/${listing.id}`, P)).unavailable.length, 2);
    await ok('POST', `/owner/bookings/${booking.id}/confirm`, O);
    await ok('POST', `/owner/bookings/${booking.id}/start`, O);
    const completed = (await ok('POST', `/owner/bookings/${booking.id}/complete`, O)).booking;
    assert.equal(completed.commissionUsd, 9);
    const ownerAccount = await ok('GET', `/admin/billing/accounts/${completed.owner.id}`, admin);
    assert.equal(ownerAccount.balanceUsd, 9);
    log('owner approve → car listing → admin approve → quote → license gate → booking (no overlap) → confirm → start → complete ($9 commission)');

    // ---------- admin config ----------
    await fails('DUPLICATE_ROUTE', 'POST', '/admin/route-fares', admin, { fromPlaceId: tripoli.id, toPlaceId: minieh.id, vehicleType: 'TAXI', priceUsd: 4, bidirectional: true });
    await ok('PUT', '/admin/pricing/TAXI', admin, { mode: 'CALCULATED', baseFare: 1, perKm: 1, perMin: 0, minimumFare: 2 });
    const calc = await ok('POST', '/rides/estimate', P, { pickup: { lat: minieh.lat, lng: minieh.lng }, dropoff: { lat: tripoli.lat, lng: tripoli.lng } });
    assert.equal(calc.estimates.find((e: any) => e.vehicleType === 'TAXI').pricingMode, 'CALCULATED');
    await fails('PLACE_IN_USE', 'DELETE', `/admin/places/${minieh.id}`, admin);
    const stats = await ok('GET', '/admin/stats', admin);
    assert.equal(stats.users, 4);
    assert.equal(stats.rides.completedToday, 2);
    assert.equal((await ok('GET', '/admin/rides', admin)).total, 4);
    assert.equal((await ok('GET', '/admin/bookings', admin)).total, 2);
    await ok('PATCH', `/admin/users/${completed.renter.id}`, admin, { status: 'BLOCKED' });
    await fails('USER_BLOCKED', 'GET', '/auth/me', P);
    log('route duplicate guard, pricing mode switch, place-in-use guard, stats, block user');

    // ---------- driver gender ----------
    const W = await reg('Driver Wafa', '71444444', 'FEMALE');
    const WP = await reg('Passenger Rana', '03555555', 'FEMALE');
    const at = (p: any, address: string) => ({ lat: p.lat, lng: p.lng, address });
    const estimate = () => ok('POST', '/rides/estimate', WP, { pickup: { lat: minieh.lat, lng: minieh.lng }, dropoff: { lat: tripoli.lat, lng: tripoli.lng } });
    const taxiNearby = (e: any) => e.estimates.find((x: any) => x.vehicleType === 'TAXI').womanDriverNearby;
    await ok('POST', '/driver/apply', W, {
      vehicleType: 'TAXI', vehicleMake: 'Kia', vehicleModel: 'Rio', vehicleColor: 'Red',
      plateNumber: 'T 777777', licenseNumber: 'L-7', billingPlan: 'COMMISSION',
    });
    let e = await estimate();
    assert.equal(e.hasWomenDrivers, false, 'pending woman driver must not count');
    const wPending = await ok('GET', '/admin/drivers?status=PENDING', admin);
    await ok('POST', `/admin/drivers/${wPending.items[0].id}/approve`, admin);
    e = await estimate();
    assert.equal(e.hasWomenDrivers, true);
    assert.equal(taxiNearby(e), false, 'offline woman driver is not nearby');

    const rw = (await ok('POST', '/rides', WP, { vehicleType: 'TAXI', driverGender: 'FEMALE', pickup: at(minieh, 'A'), dropoff: at(tripoli, 'B') })).ride;
    assert.equal(rw.driverGender, 'FEMALE');
    assert.equal((await ok('GET', '/driver/offers', D)).rides.length, 0, 'man driver must not get a woman-only offer');
    await fails('RIDE_NOT_AVAILABLE', 'POST', `/rides/${rw.id}/accept`, D);

    const wSock = await connect(W);
    const wOffer = nextEvent(wSock, 'ride:offer');
    await ok('POST', '/driver/online', W, { lat: minieh.lat, lng: minieh.lng });
    assert.equal((await wOffer).ride.id, rw.id);
    assert.equal(taxiNearby(await estimate()), true);
    await ok('POST', `/rides/${rw.id}/accept`, W);
    await ok('POST', `/rides/${rw.id}/arrived`, W);
    await ok('POST', `/rides/${rw.id}/start`, W);
    await ok('POST', `/rides/${rw.id}/complete`, W);

    const rm = (await ok('POST', '/rides', WP, { vehicleType: 'TAXI', driverGender: 'MALE', pickup: at(minieh, 'A'), dropoff: at(tripoli, 'B') })).ride;
    assert.equal((await ok('GET', '/driver/offers', W)).rides.length, 0, 'woman driver must not get a man-only offer');
    await fails('RIDE_NOT_AVAILABLE', 'POST', `/rides/${rm.id}/accept`, W);
    await ok('POST', `/rides/${rm.id}/cancel`, WP, { reason: 'test' });

    const wUserId = (await ok('GET', '/auth/me', W)).user.id;
    assert.equal((await ok('GET', '/admin/drivers?search=Wafa', admin)).items[0].user.gender, 'FEMALE');
    await ok('PATCH', `/admin/users/${wUserId}`, admin, { status: 'BLOCKED' });
    assert.equal((await estimate()).hasWomenDrivers, false, 'blocked woman driver must not count');
    log('gender: availability flags, woman-only/man-only dispatch, late online offer, accept guard, pending/blocked excluded');

    console.log('\nAll e2e scenarios passed.');
  } finally {
    sockets.forEach((s) => s.close());
    server.close();
    await prisma.$disconnect();
    await db.stop();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('\nE2E FAILED:', err);
    process.exit(1);
  },
);
