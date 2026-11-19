import { loadConfig } from '../src/server/config/env';
import { loadHotelConfig } from '../src/server/config/hotel';
import type { AppContext } from '../src/server/context';
import { Db } from '../src/server/db/database';
import { seedIfEmpty } from '../src/server/db/seed';
import { FixedClock } from '../src/server/lib/time';
import { createReservation, type CreateReservationInput } from '../src/server/modules/reservations';
import { checkIn } from '../src/server/modules/stays';

export const hotel = loadHotelConfig('config/hotel.json');

/** A fresh in-memory hotel. Default "now" is 10:00 Dubai time on Mon 2 Mar 2026 (06:00 UTC). */
export function makeCtx(opts: { now?: string; env?: Record<string, string> } = {}) {
  const clock = new FixedClock(new Date(opts.now ?? '2026-03-02T06:00:00Z'));
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_PATH: ':memory:', AUTO_ADVANCE_SECONDS: '60', ...opts.env });
  const db = new Db(':memory:');
  seedIfEmpty(db, hotel);
  const ctx: AppContext = { db, config, hotel, clock };
  return { ctx, clock };
}

export function bookingInput(over: Partial<CreateReservationInput> = {}): CreateReservationInput {
  return {
    roomTypeSlug: 'deluxe-king',
    checkIn: '2026-03-02',
    checkOut: '2026-03-04',
    adults: 2,
    children: 0,
    guest: { firstName: 'Aisha', lastName: 'Khan', email: 'aisha@example.com', phone: '+971500000000' },
    card: { holder: 'Aisha Khan', number: '4242 4242 4242 4242', expiry: '12/29' },
    ...over,
  };
}

export function checkedInGuest(ctx: AppContext, over: Partial<CreateReservationInput> = {}) {
  const r = createReservation(ctx, bookingInput(over));
  return checkIn(ctx, {
    code: r.code,
    lastName: r.last_name,
    nationality: 'India',
    idType: 'passport',
    idNumber: 'Z1234567',
    acceptTerms: true,
  });
}

export const itemId = (ctx: AppContext, code: string) =>
  ctx.db.get<{ id: number }>('SELECT id FROM catalog_items WHERE code = ?', [code])!.id;

export function expectHttpError(fn: () => unknown, status: number, code?: string) {
  try {
    fn();
  } catch (err) {
    const e = err as { status?: number; code?: string };
    if (e.status !== status || (code && e.code !== code)) {
      throw new Error(`Expected HTTP ${status}${code ? ` ${code}` : ''}, got ${e.status} ${e.code}: ${String(err)}`);
    }
    return;
  }
  throw new Error(`Expected HTTP ${status} but the call succeeded`);
}
