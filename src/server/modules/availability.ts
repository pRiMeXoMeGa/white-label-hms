import type { AvailabilityResult } from '../../shared/types';
import { today, type AppContext } from '../context';
import { badRequest } from '../lib/errors';
import { sum } from '../lib/money';
import { addDays, daysBetween, isIsoDate } from '../lib/time';
import { listRoomTypes, priceStay, toRoomTypeDto } from './rooms';

export interface StayQuery {
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
}

export function validateStayDates(ctx: AppContext, checkIn: string, checkOut: string) {
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) throw badRequest('Dates must be in YYYY-MM-DD format');
  const t = today(ctx);
  if (checkIn < t) throw badRequest('Check-in date cannot be in the past');
  if (checkOut <= checkIn) throw badRequest('Check-out must be after check-in');
  const nights = daysBetween(checkIn, checkOut);
  if (nights > ctx.hotel.maxNights) throw badRequest(`Stays are limited to ${ctx.hotel.maxNights} nights`);
  if (checkIn > addDays(t, ctx.hotel.bookingWindowDays)) {
    throw badRequest(`Bookings open ${ctx.hotel.bookingWindowDays} days ahead`);
  }
  return nights;
}

/**
 * Rooms of a type that are bookable for every night of [checkIn, checkOut):
 * not out of order and with no sold room-night in the range. Clean rooms first.
 */
export function freeRoomIds(ctx: AppContext, roomTypeId: number, checkIn: string, checkOut: string): number[] {
  return ctx.db
    .all<{ id: number }>(
      `SELECT r.id FROM rooms r
       WHERE r.room_type_id = ? AND r.housekeeping_status <> 'out_of_order'
         AND NOT EXISTS (
           SELECT 1 FROM room_nights n WHERE n.room_id = r.id AND n.night >= ? AND n.night < ?
         )
       ORDER BY CASE r.housekeeping_status WHEN 'clean' THEN 0 ELSE 1 END, r.number`,
      [roomTypeId, checkIn, checkOut],
    )
    .map((r) => r.id);
}

export function searchAvailability(ctx: AppContext, q: StayQuery): AvailabilityResult {
  const nights = validateStayDates(ctx, q.checkIn, q.checkOut);
  const options = listRoomTypes(ctx).map((rt) => {
    const nightly = priceStay(ctx, rt, q.checkIn, q.checkOut);
    return {
      roomType: toRoomTypeDto(rt),
      available: freeRoomIds(ctx, rt.id, q.checkIn, q.checkOut).length,
      nightly,
      totalMinor: sum(nightly.map((n) => n.rateMinor)),
      fitsParty: q.adults <= rt.max_adults && q.children <= rt.max_children,
    };
  });
  return { checkIn: q.checkIn, checkOut: q.checkOut, nights, options };
}
