// npm run seed:reset: deletes the local database and re-creates it from the hotel config.
import { rmSync } from 'node:fs';
import { loadConfig } from '../config/env';
import { loadHotelConfig } from '../config/hotel';
import { Db } from './database';
import { seedIfEmpty } from './seed';

const config = loadConfig();
for (const suffix of ['', '-wal', '-shm']) rmSync(config.databasePath + suffix, { force: true });
const db = new Db(config.databasePath);
seedIfEmpty(db, loadHotelConfig(config.hotelConfigPath));
db.close();
console.log(`Database reset at ${config.databasePath}`);
