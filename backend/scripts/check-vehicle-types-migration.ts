/**
 * Proves scripts/migrate-vehicle-types.ts upgrades a database built from the OLD schema (vehicle type enum +
 * PricingRule table) without losing data, and that running it twice is safe.
 * Uses a throwaway MySQL server; leaves no files behind.
 * Run: npm run test:migrate-vehicle-types
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { createDB } from 'mysql-memory-server';

const OLD_SCHEMA_COMMIT = 'be98274';

async function main() {
  const tmp = mkdtempSync(path.join(tmpdir(), 'cedra-migration-check-'));
  console.log('Starting throwaway MySQL…');
  const db = await createDB({ logLevel: 'ERROR' });
  const url = `mysql://${db.username}@127.0.0.1:${db.port}/${db.dbName}`;
  const env = { ...process.env, DATABASE_URL: url };
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    console.log(`Creating the old schema (${OLD_SCHEMA_COMMIT})…`);
    const oldSchema = path.join(tmp, 'schema.prisma');
    writeFileSync(oldSchema, execSync(`git show ${OLD_SCHEMA_COMMIT}:backend/prisma/schema.prisma`));
    execSync(`npx prisma db push --skip-generate --schema "${oldSchema}"`, { env, stdio: 'pipe' });

    const sql = (q: string) => prisma.$executeRawUnsafe(q);
    await sql("INSERT INTO `User` (`id`, `name`, `phone`, `passwordHash`, `updatedAt`) VALUES (1, 'Driver', '70111111', 'x', NOW(3))");
    await sql(
      "INSERT INTO `DriverProfile` (`userId`, `vehicleType`, `vehicleMake`, `vehicleModel`, `vehicleColor`, `plateNumber`, `licenseNumber`, `updatedAt`) " +
        "VALUES (1, 'TUKTUK', 'Bajaj', 'RE', 'Red', 'T123', 'L123', NOW(3))",
    );
    await sql(
      "INSERT INTO `Ride` (`id`, `passengerId`, `vehicleType`, `pricingMode`, `pickupLat`, `pickupLng`, `pickupAddress`, `dropoffLat`, `dropoffLng`, `dropoffAddress`, `distanceKm`, `durationMin`, `fareUsd`, `lbpRate`) " +
        "VALUES (1, 1, 'TUKTUK', 'CALCULATED', 34.48, 35.93, 'A', 34.43, 35.84, 'B', 6, 12, 3, 89500)",
    );
    await sql("INSERT INTO `Place` (`id`, `nameEn`, `nameAr`, `lat`, `lng`) VALUES (1, 'Minieh', 'المنية', 34.48, 35.93), (2, 'Tripoli', 'طرابلس', 34.436, 35.845)");
    await sql("INSERT INTO `RouteFare` (`fromPlaceId`, `toPlaceId`, `vehicleType`, `priceUsd`) VALUES (1, 2, 'TAXI', 5)");
    await sql(
      "INSERT INTO `PricingRule` (`vehicleType`, `mode`, `baseFare`, `perKm`, `perMin`, `minimumFare`, `updatedAt`) " +
        "VALUES ('TAXI', 'FIXED_ROUTE', 1.75, 0.6, 0.05, 2, NOW(3))",
    );
    await sql("INSERT INTO `Setting` (`key`, `value`) VALUES ('monthlyFeeTaxiUsd', '33')");

    for (const run of [1, 2]) {
      console.log(`\nRunning the migration (run ${run})…`);
      execSync('npx tsx scripts/migrate-vehicle-types.ts', { env, stdio: 'inherit' });
    }

    const types = await prisma.$queryRawUnsafe<{ code: string; baseFare: unknown; monthlyFeeUsd: unknown; mode: string; sortOrder: number }[]>(
      'SELECT `code`, `baseFare`, `monthlyFeeUsd`, `mode`, `sortOrder` FROM `VehicleType` ORDER BY `code`',
    );
    assert.deepEqual(types.map((t) => t.code), ['TAXI', 'TUKTUK'], 'VehicleType should hold TAXI and TUKTUK');
    const taxi = types[0];
    assert.equal(taxi.sortOrder, 1, 'TAXI sortOrder should be 1');
    assert.equal(types[1].sortOrder, 2, 'TUKTUK sortOrder should be 2');
    assert.equal(Number(taxi.baseFare), 1.75, 'TAXI baseFare should come from the old PricingRule');
    assert.equal(taxi.mode, 'FIXED_ROUTE', 'TAXI mode should come from the old PricingRule');
    assert.equal(Number(taxi.monthlyFeeUsd), 33, 'TAXI monthlyFeeUsd should come from the old monthlyFeeTaxiUsd setting');
    assert.equal(Number(types[1].monthlyFeeUsd), 15, 'TUKTUK monthlyFeeUsd should default to 15');

    const [ride] = await prisma.$queryRawUnsafe<{ vehicleType: string }[]>('SELECT `vehicleType` FROM `Ride` WHERE `id` = 1');
    assert.equal(ride?.vehicleType, 'TUKTUK', 'the ride should keep vehicleType TUKTUK');
    const [driver] = await prisma.$queryRawUnsafe<{ vehicleType: string }[]>('SELECT `vehicleType` FROM `DriverProfile` WHERE `userId` = 1');
    assert.equal(driver?.vehicleType, 'TUKTUK', 'the driver should keep vehicleType TUKTUK');
    const [route] = await prisma.$queryRawUnsafe<{ vehicleType: string }[]>('SELECT `vehicleType` FROM `RouteFare` LIMIT 1');
    assert.equal(route?.vehicleType, 'TAXI', 'the route fare should keep vehicleType TAXI');

    const fks = await prisma.$queryRawUnsafe<{ TABLE_NAME: string }[]>(
      'SELECT `TABLE_NAME` FROM information_schema.KEY_COLUMN_USAGE ' +
        "WHERE `TABLE_SCHEMA` = DATABASE() AND `COLUMN_NAME` = 'vehicleType' " +
        "AND `REFERENCED_TABLE_NAME` = 'VehicleType' AND `REFERENCED_COLUMN_NAME` = 'code' ORDER BY `TABLE_NAME`",
    );
    assert.deepEqual(
      fks.map((f) => f.TABLE_NAME.toLowerCase()), // MySQL on Windows stores table names in lower case
      ['driverprofile', 'ride', 'routefare'],
      'vehicleType foreign keys to VehicleType.code are missing',
    );

    const pricingRule = await prisma.$queryRawUnsafe<unknown[]>(
      "SELECT 1 FROM information_schema.TABLES WHERE `TABLE_SCHEMA` = DATABASE() AND LOWER(`TABLE_NAME`) = 'pricingrule'",
    );
    assert.equal(pricingRule.length, 0, 'table PricingRule should be dropped');

    const feeSettings = await prisma.$queryRawUnsafe<unknown[]>(
      "SELECT 1 FROM `Setting` WHERE `key` IN ('monthlyFeeTaxiUsd', 'monthlyFeeTuktukUsd')",
    );
    assert.equal(feeSettings.length, 0, 'old monthly fee settings should be removed');

    console.log('\nMigration check passed.');
  } finally {
    await prisma.$disconnect();
    await db.stop();
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
