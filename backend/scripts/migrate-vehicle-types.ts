/**
 * Upgrades a database built from the old schema (VehicleType enum + PricingRule table + monthly fee settings)
 * to the admin-managed VehicleType table, keeping all data. Safe to run more than once, and on a fresh or
 * already-migrated database. BACK UP THE DATABASE FIRST.
 *
 * Run: npm run db:migrate-vehicle-types   (uses DATABASE_URL)
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { prisma } from '../src/db.js';
import { LEGACY_VEHICLE_TYPES } from '../src/services/vehicleTypes.js';

const VEHICLE_TABLES = ['DriverProfile', 'Ride', 'RouteFare'] as const;
const FEE_SETTINGS = { TAXI: 'monthlyFeeTaxiUsd', TUKTUK: 'monthlyFeeTuktukUsd' } as const;
const DEFAULT_FEES = { TAXI: 30, TUKTUK: 15 } as const;

// Same column definition and table options as `prisma migrate diff` produces for model VehicleType.
const CREATE_VEHICLE_TYPE = `CREATE TABLE IF NOT EXISTS \`VehicleType\` (
    \`code\` VARCHAR(20) NOT NULL,
    \`nameEn\` VARCHAR(60) NOT NULL,
    \`nameAr\` VARCHAR(60) NOT NULL,
    \`icon\` ENUM('CAR', 'TUKTUK', 'MOTORCYCLE', 'VAN', 'BUS') NOT NULL,
    \`capacity\` INTEGER NOT NULL,
    \`mode\` ENUM('CALCULATED', 'FIXED_ROUTE') NOT NULL DEFAULT 'CALCULATED',
    \`baseFare\` DECIMAL(10, 2) NOT NULL,
    \`perKm\` DECIMAL(10, 2) NOT NULL,
    \`perMin\` DECIMAL(10, 2) NOT NULL,
    \`minimumFare\` DECIMAL(10, 2) NOT NULL,
    \`monthlyFeeUsd\` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    \`active\` BOOLEAN NOT NULL DEFAULT true,
    \`sortOrder\` INTEGER NOT NULL DEFAULT 0,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL,

    PRIMARY KEY (\`code\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`;

type PricingRuleRow = { vehicleType: string; mode: string; baseFare: unknown; perKm: unknown; perMin: unknown; minimumFare: unknown };

const log = (msg: string) => console.log(`[vehicle-types] ${msg}`);
const dbPush = (extra = '') => execSync(`npx prisma db push --skip-generate ${extra}`.trim(), { stdio: 'inherit' });

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${name}`;
  return rows.length > 0;
}

function feeFrom(value: string | undefined, key: string, fallback: number): number {
  if (value === undefined) return fallback;
  const fee = Number(value);
  if (!Number.isFinite(fee) || fee < 0) throw new Error(`Setting ${key} = "${value}" is not a valid fee; fix it and re-run.`);
  return fee;
}

async function main() {
  // 1. Fresh database: nothing to convert.
  if (!(await tableExists('DriverProfile'))) {
    log('No existing tables found; creating the schema with prisma db push.');
    await prisma.$disconnect();
    dbPush();
    return;
  }

  // 2. Snapshot the old pricing rules and monthly fee settings.
  const rules = (await tableExists('PricingRule'))
    ? await prisma.$queryRaw<PricingRuleRow[]>`
        SELECT vehicleType, mode, baseFare, perKm, perMin, minimumFare FROM PricingRule`
    : [];
  const settings = await prisma.$queryRaw<{ key: string; value: string }[]>`
    SELECT \`key\`, \`value\` FROM Setting WHERE \`key\` IN (${FEE_SETTINGS.TAXI}, ${FEE_SETTINGS.TUKTUK})`;
  const feeOf = (code: 'TAXI' | 'TUKTUK') =>
    feeFrom(settings.find((s) => s.key === FEE_SETTINGS[code])?.value, FEE_SETTINGS[code], DEFAULT_FEES[code]);
  const fees = { TAXI: feeOf('TAXI'), TUKTUK: feeOf('TUKTUK') }; // validated before anything is changed

  // 3. Enum columns -> VARCHAR(20) with the same charset/collation as VehicleType.code (needed for the FKs).
  for (const table of VEHICLE_TABLES) {
    const [col] = await prisma.$queryRaw<{ DATA_TYPE: string }[]>`
      SELECT DATA_TYPE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = 'vehicleType'`;
    if (!col) throw new Error(`Column ${table}.vehicleType not found; is this the Cedra database?`);
    if (col.DATA_TYPE.toLowerCase() === 'enum') {
      log(`Converting ${table}.vehicleType to VARCHAR(20).`);
      await prisma.$executeRawUnsafe(
        `ALTER TABLE \`${table}\` MODIFY \`vehicleType\` VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL`,
      );
    }
  }

  // 4. The new table.
  await prisma.$executeRawUnsafe(CREATE_VEHICLE_TYPE);

  // 5. TAXI and TUKTUK from today's defaults, with the old pricing rules and fees when present.
  for (const code of ['TAXI', 'TUKTUK'] as const) {
    const v = LEGACY_VEHICLE_TYPES[code];
    const rule = rules.find((r) => r.vehicleType === code);
    const fee = fees[code];
    const inserted = await prisma.$executeRaw`
      INSERT IGNORE INTO VehicleType
        (code, nameEn, nameAr, icon, capacity, mode, baseFare, perKm, perMin, minimumFare, monthlyFeeUsd, sortOrder, updatedAt)
      VALUES (
        ${v.code}, ${v.nameEn}, ${v.nameAr}, ${v.icon}, ${v.capacity}, ${rule?.mode ?? v.mode},
        ${String(rule?.baseFare ?? v.baseFare)}, ${String(rule?.perKm ?? v.perKm)}, ${String(rule?.perMin ?? v.perMin)},
        ${String(rule?.minimumFare ?? v.minimumFare)}, ${String(fee)}, ${v.sortOrder ?? 0}, NOW(3))`;
    if (inserted > 0) log(`Created vehicle type ${code}${rule ? ' (pricing from PricingRule)' : ''}, monthly fee $${fee}.`);
  }

  // 6. Every vehicleType value must have a VehicleType row before the foreign keys can be added.
  const missing: string[] = [];
  for (const table of VEHICLE_TABLES) {
    const rows = await prisma.$queryRawUnsafe<{ vehicleType: string }[]>(
      `SELECT DISTINCT t.\`vehicleType\` FROM \`${table}\` t
       LEFT JOIN \`VehicleType\` v ON v.\`code\` = t.\`vehicleType\` WHERE v.\`code\` IS NULL`,
    );
    for (const r of rows) missing.push(`${table}.vehicleType = '${r.vehicleType}'`);
  }
  if (missing.length) {
    throw new Error(
      `These vehicle types have no VehicleType row, so the foreign keys can't be added:\n  ${missing.join('\n  ')}\n` +
        'Create the missing types (or fix the rows) and re-run.',
    );
  }

  // 7. Let Prisma add the foreign keys and drop PricingRule, then remove the old fee settings.
  await prisma.$disconnect();
  dbPush('--accept-data-loss');
  const removed = await prisma.$executeRaw`
    DELETE FROM Setting WHERE \`key\` IN (${FEE_SETTINGS.TAXI}, ${FEE_SETTINGS.TUKTUK})`;
  if (removed > 0) log(`Removed ${removed} old monthly fee setting(s).`);
  log('Done.');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
