import { rmSync } from 'node:fs';
import { loadConfig } from './config/env';
import { loadHotelConfig } from './config/hotel';
import type { AppContext } from './context';
import { Db } from './db/database';
import { seedIfEmpty } from './db/seed';
import { createHttpServer } from './http/server';
import { systemClock } from './lib/time';
import { startScheduler } from './modules/requests/scheduler';

const log = (msg: string, extra: object = {}) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), msg, ...extra }));

function main() {
  const config = loadConfig();
  const hotel = loadHotelConfig(config.hotelConfigPath);

  if (config.resetDbOnStart && config.databasePath !== ':memory:') {
    for (const suffix of ['', '-wal', '-shm']) rmSync(config.databasePath + suffix, { force: true });
    log('database reset', { path: config.databasePath });
  }
  const db = new Db(config.databasePath);
  if (seedIfEmpty(db, hotel)) log('database seeded', { hotel: hotel.brand.name });

  const ctx: AppContext = { db, config, hotel, clock: systemClock };
  const stopScheduler = startScheduler(ctx, log);
  const server = createHttpServer(ctx, log);

  server.listen(config.port, config.host, () => {
    log('listening', { url: `http://localhost:${config.port}`, hotel: hotel.brand.name, env: config.env });
  });

  const shutdown = (signal: string) => {
    log('shutting down', { signal });
    stopScheduler();
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
