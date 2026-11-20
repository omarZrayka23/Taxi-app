import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { initRealtime } from './services/realtime.js';
import { startRideSweeper } from './services/rides.js';

const app = createApp();
const server = http.createServer(app);
initRealtime(server);
startRideSweeper();

server.listen(config.port, () => {
  console.log(`Cedra API listening on http://localhost:${config.port}/api`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
