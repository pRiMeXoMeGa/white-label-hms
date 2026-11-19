import { z } from 'zod';
import type { ReservationDto, ReservationStatus } from '../../shared/types';
import { nowIso, type AppContext } from '../context';
import { isUniqueViolation } from '../db/database';
import { reservationCode, normalizeCode } from '../lib/codes';
import { conflict, notFound, unprocessable } from '../lib/errors';
import { cardBrand, isValidCardNumber, sum } from '../lib/money';
import { addDays, daysBetween } from '../lib/time';
import { freeRoomIds, validateStayDates } from './availability';
import { getRoomType, priceStay } from './rooms';

export interface ReservationRow {
  id: number;
  code: string;
  stay_code: string | null;
  room_type_id: number;
  room_id: number;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  special_requests: string | null;
  status: ReservationStatus;
  room_total_minor: number;
  card_brand: string | null;
  card_last4: string | null;
  nationality: string | null;
  id_type: string | null;
  id_last4: string | null;
  arrival_time: string | null;
  created_at: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  cancelled_at: string | null;
}

const name = z.string().trim().min(1).max(60);

export const CreateReservationSchema = z.object({
  roomTypeSlug: z.string().min(1),
  checkIn: z.string(),
  checkOut: z.string(),
  adults: z.coerce.number().int().min(1).max(6),
  children: z.coerce.number().int().min(0).max(6).default(0),
  guest: z.object({
    firstName: name,
    lastName: name,
    email: z.string().trim().email().max(120),
    phone: z.string().trim().min(6).max(30),
    specialRequests: z.string().trim().max(500).optional(),
  }),
  // Card guarantee. Only brand + last 4 digits are kept; a real build would hand the number
  // to a payment gateway's hosted fields and store a token instead (keeps PCI scope minimal).
  card: z.object({
    holder: name,
    number: z.string().refine(isValidCardNumber, 'Card number is not valid'),
    expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Use MM/YY'),
  }),
});
export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;

export function getReservationByCode(ctx: AppContext, code: string): ReservationRow | undefined {
  return ctx.db.get<ReservationRow>('SELECT * FROM reservations WHERE code = ?', [normalizeCode(code)]);
}

/** Looks a booking up by reference + last name; both must match (case-insensitive). */
export function findReservation(ctx: AppContext, code: string, lastName: string): ReservationRow {
  const r = getReservationByCode(ctx, code);
  if (!r || r.last_name.trim().toLowerCase() !== lastName.trim().toLowerCase()) {
    throw notFound('We could not find a booking with that reference and last name');
  }
  return r;
}

export function toReservationDto(ctx: AppContext, r: ReservationRow): ReservationDto {
  const rt = getRoomType(ctx, r.room_type_id);
  const room = ctx.db.get<{ number: string }>('SELECT number FROM rooms WHERE id = ?', [r.room_id]);
  return {
    code: r.code,
    status: r.status,
    roomType: { name: rt?.name ?? '', slug: rt?.slug ?? '' },
    // The room number is only revealed once the guest has checked in.
    roomNumber: r.status === 'checked_in' || r.status === 'checked_out' ? (room?.number ?? null) : null,
    checkIn: r.check_in,
    checkOut: r.check_out,
    nights: daysBetween(r.check_in, r.check_out),
    adults: r.adults,
    children: r.children,
    guest: { firstName: r.first_name, lastName: r.last_name, email: r.email, phone: r.phone },
    roomTotalMinor: r.room_total_minor,
    cardLast4: r.card_last4,
    canCheckInFrom: addDays(r.check_in, -ctx.config.earlyCheckinDays),
    stayCode: r.status === 'checked_in' ? r.stay_code : null,
    createdAt: r.created_at,
  };
}

export function createReservation(ctx: AppContext, input: CreateReservationInput): ReservationRow {
  validateStayDates(ctx, input.checkIn, input.checkOut);
  const rt = getRoomType(ctx, input.roomTypeSlug);
  if (!rt) throw notFound('Room type not found');
  if (input.adults > rt.max_adults || input.children > rt.max_children) {
    throw unprocessable('party_too_large', `${rt.name} sleeps up to ${rt.max_adults} adults and ${rt.max_children} children`);
  }
  const nightly = priceStay(ctx, rt, input.checkIn, input.checkOut);
  const digits = input.card.number.replace(/\D/g, '');

  return ctx.db.tx(() => {
    // Inside BEGIN IMMEDIATE no other writer can run, so this check-then-insert is safe;
    // the room_nights primary key would still reject a double booking if it were not.
    const roomId = freeRoomIds(ctx, rt.id, input.checkIn, input.checkOut)[0];
    if (roomId === undefined) {
      throw conflict('sold_out', `${rt.name} is no longer available for these dates`);
    }
    let code = '';
    let reservationId = 0;
    for (let attempt = 0; attempt < 5 && !reservationId; attempt++) {
      code = reservationCode(ctx.hotel.brand.codePrefix);
      try {
        reservationId = ctx.db.run(
          `INSERT INTO reservations (code, room_type_id, room_id, check_in, check_out, adults, children,
             first_name, last_name, email, phone, special_requests, status, room_total_minor,
             card_brand, card_last4, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?)`,
          [
            code, rt.id, roomId, input.checkIn, input.checkOut, input.adults, input.children,
            input.guest.firstName, input.guest.lastName, input.guest.email.toLowerCase(), input.guest.phone,
            input.guest.specialRequests ?? null, sum(nightly.map((n) => n.rateMinor)),
            cardBrand(digits), digits.slice(-4), nowIso(ctx),
          ],
        ).lastId;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err; // code collision: try another code
      }
    }
    if (!reservationId) throw new Error('Could not allocate a booking reference');
    for (const n of nightly) {
      ctx.db.run('INSERT INTO room_nights (room_id, night, reservation_id, rate_minor) VALUES (?, ?, ?, ?)', [
        roomId, n.date, reservationId, n.rateMinor,
      ]);
    }
    return ctx.db.get<ReservationRow>('SELECT * FROM reservations WHERE id = ?', [reservationId])!;
  });
}

export function cancelReservation(ctx: AppContext, code: string, lastName: string): ReservationRow {
  const r = findReservation(ctx, code, lastName);
  if (r.status !== 'confirmed') {
    throw conflict('not_cancellable', 'Only bookings that have not checked in can be cancelled online');
  }
  return ctx.db.tx(() => {
    ctx.db.run('DELETE FROM room_nights WHERE reservation_id = ?', [r.id]);
    ctx.db.run("UPDATE reservations SET status = 'cancelled', cancelled_at = ? WHERE id = ?", [nowIso(ctx), r.id]);
    return ctx.db.get<ReservationRow>('SELECT * FROM reservations WHERE id = ?', [r.id])!;
  });
}
