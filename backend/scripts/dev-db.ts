/**
 * Starts a TEMPORARY MySQL server for local development when MySQL isn't installed.
 * Data is lost when this process stops. For real use install MySQL 8 and use .env DATABASE_URL.
 *
 * Run: npm run dev:db   (then in another terminal: npm run dev:tempdb)
 */
import { execSync } from 'node:child_process';
import { createDB } from 'mysql-memory-server';

const PORT = Number(process.env.DEV_DB_PORT ?? 3307);

async function main() {
  console.log('Starting temporary MySQL…');
  const db = await createDB({ port: PORT, dbName: 'cedra', logLevel: 'ERROR' });
  const url = `mysql://${db.username}@127.0.0.1:${db.port}/${db.dbName}`;
  const env = { ...process.env, DATABASE_URL: url };
  execSync('npx prisma db push --skip-generate', { env, stdio: 'inherit' });
  execSync('npx tsx prisma/seed.ts', { env, stdio: 'inherit' });
  console.log(`\nTemporary MySQL ready: ${url}\nPress Ctrl+C to stop (data will be lost).`);

  const stop = async () => {
    await db.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  setInterval(() => undefined, 1 << 30);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
