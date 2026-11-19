import type { AppConfig } from './config/env';
import type { HotelConfig } from './config/hotel';
import type { Db } from './db/database';
import type { Clock } from './lib/time';
import { hotelToday } from './lib/time';

/** Everything a module needs, passed explicitly so tests can swap the clock and database. */
export interface AppContext {
  db: Db;
  config: AppConfig;
  hotel: HotelConfig;
  clock: Clock;
}

export const nowIso = (ctx: AppContext) => ctx.clock.now().toISOString();
export const today = (ctx: AppContext) => hotelToday(ctx.clock, ctx.hotel.timezone);
