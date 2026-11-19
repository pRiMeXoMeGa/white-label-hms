import { z } from 'zod';
import type { StayDto, StayInfo } from '../../shared/types';
import { nowIso, today, type AppContext } from '../context';
import { isUniqueViolation } from '../db/database';
import { normalizeCode, stayCode } from '../lib/codes';
import { LookupError, conflict, unprocessable } from '../lib/errors';
import { HHMM_RE, addDays, daysBetween, humanDate, toHotelLocal } from '../lib/time';
import { getBill, postEntry } from './billing/folio';
import { findReservation, type ReservationRow } from './reservations';
import { getRoomType } from './rooms';

export const CheckInSchema = z.object({
  code: z.string().min(3),
  lastName: z.string().trim().min(1),
  nationality: z.string().trim().min(2).max(60),
  idType: z.enum(['passport', 'emirates_id', 'national_id']),
  idNumber: z.string().trim().min(5).max(30),
  arrivalTime: z.string().regex(HHMM_RE, 'Use HH:mm, for example 15:30').optional(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Please accept the hotel terms' }) }),
});
export type CheckInInput = z.infer<typeof CheckInSchema>;

export function checkIn(ctx: AppContext, input: CheckInInput): ReservationRow {
  const r = findReservation(ctx, input.code, input.lastName);
  if (r.status === 'checked_in') return r; // idempotent: same credentials, same stay
  if (r.status !== 'confirmed') throw conflict('not_checkinable', `This booking is ${r.status.replace('_', ' ')}`);

  const t = today(ctx);
  const opensOn = addDays(r.check_in, -ctx.config.earlyCheckinDays);
  if (t < opensOn) throw unprocessable('too_early', `Online check-in opens on ${humanDate(opensOn)}`);
  if (t >= r.check_out) throw unprocessable('too_late', 'This booking has already ended');

  const rt = getRoomType(ctx, r.room_type_id)!;
  const nights = ctx.db.all<{ night: string; rate_minor: number }>(
    'SELECT night, rate_minor FROM room_nights WHERE reservation_id = ? ORDER BY night',
    [r.id],
  );

  return ctx.db.tx(() => {
    let changes = -1;
    for (let attempt = 0; attempt < 5 && changes < 0; attempt++) {
      try {
        changes = ctx.db.run(
          `UPDATE reservations SET status = 'checked_in', stay_code = ?, nationality = ?, id_type = ?, id_last4 = ?,
             arrival_time = ?, checked_in_at = ? WHERE id = ? AND status = 'confirmed'`,
          [stayCode(), input.nationality, input.idType, input.idNumber.replace(/\s/g, '').slice(-4),
            input.arrivalTime ?? null, nowIso(ctx), r.id],
        ).changes;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    // Nothing changed: another request checked this booking in first, so its room charges exist.
    if (changes !== 1) {
      const current = ctx.db.get<ReservationRow>('SELECT * FROM reservations WHERE id = ?', [r.id])!;
      if (current.status === 'checked_in') return current;
      throw conflict('not_checkinable', 'This booking could not be checked in, please try again');
    }
    // Post one room charge per booked night; early departure is handled with adjustments.
    for (const n of nights) {
      postEntry(ctx, {
        reservationId: r.id,
        kind: 'charge',
        category: 'room',
        description: `Room night, ${rt.name}`,
        unitMinor: n.rate_minor,
        serviceDate: n.night,
        sourceType: 'room_night',
      });
    }
    return ctx.db.get<ReservationRow>('SELECT * FROM reservations WHERE id = ?', [r.id])!;
  });
}

export function getStay(ctx: AppContext, code: string): ReservationRow {
  const r = ctx.db.get<ReservationRow>('SELECT * FROM reservations WHERE stay_code = ?', [normalizeCode(code)]);
  if (!r) throw new LookupError('Stay not found. Check your Stay ID.');
  return r;
}

export function getActiveStay(ctx: AppContext, code: string): ReservationRow {
  const r = getStay(ctx, code);
  if (r.status !== 'checked_in') throw conflict('stay_closed', 'This stay has been checked out');
  return r;
}

/** True once the hotel-local time has passed check-out time on the check-out date. */
export function isStayOverdue(ctx: AppContext, r: ReservationRow): boolean {
  const nowLocal = toHotelLocal(ctx.clock.now(), ctx.hotel.timezone);
  return nowLocal >= `${r.check_out}T${ctx.hotel.checkOutTime}`;
}

/** New orders and bookings stop at check-out time on the check-out date. Check-out itself stays open. */
export function assertStayOpen(ctx: AppContext, r: ReservationRow) {
  if (isStayOverdue(ctx, r)) {
    throw conflict(
      'stay_ended',
      `Your stay ended at ${ctx.hotel.checkOutTime} on ${humanDate(r.check_out)}. New requests are closed; check-out is still open.`,
    );
  }
}

export function toStayDto(ctx: AppContext, r: ReservationRow): StayDto {
  const room = ctx.db.get<{ number: string; floor: number }>('SELECT number, floor FROM rooms WHERE id = ?', [r.room_id])!;
  const invoice = ctx.db.get<{ number: string }>('SELECT number FROM invoices WHERE reservation_id = ?', [r.id]);
  const feedback = ctx.db.get<{ rating: number }>('SELECT rating FROM feedback WHERE reservation_id = ?', [r.id]);
  return {
    stayCode: r.stay_code!,
    status: r.status,
    reservationCode: r.code,
    guestName: `${r.first_name} ${r.last_name}`,
    roomNumber: room.number,
    roomType: getRoomType(ctx, r.room_type_id)?.name ?? '',
    floor: room.floor,
    checkIn: r.check_in,
    checkOut: r.check_out,
    nights: daysBetween(r.check_in, r.check_out),
    balanceMinor: getBill(ctx, r).balanceMinor,
    invoiceNumber: invoice?.number ?? null,
    feedbackGiven: Boolean(feedback),
    cardOnFile: r.card_last4 ? `${r.card_brand ?? 'Card'} ending ${r.card_last4}` : null,
    overdue: r.status === 'checked_in' && isStayOverdue(ctx, r),
  };
}

/** Details only checked-in guests should see (the Wi-Fi password, for example). */
export function stayInfo(ctx: AppContext): StayInfo {
  const h = ctx.hotel;
  return { wifi: h.wifi, hours: h.hours, houseRules: h.houseRules, localGuide: h.localGuide, contact: h.contact };
}

export const FeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

export function leaveFeedback(ctx: AppContext, code: string, input: z.infer<typeof FeedbackSchema>) {
  const r = getStay(ctx, code);
  try {
    ctx.db.run('INSERT INTO feedback (reservation_id, rating, comment, created_at) VALUES (?, ?, ?, ?)', [
      r.id, input.rating, input.comment ?? null, nowIso(ctx),
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('feedback_exists', 'Thanks, we already have your feedback');
    throw err;
  }
}
