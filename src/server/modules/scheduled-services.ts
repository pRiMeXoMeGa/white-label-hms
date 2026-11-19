import { z } from 'zod';
import type { SpaSlotDto, SpaTreatmentDto, TransferOptions } from '../../shared/types';
import { today, type AppContext } from '../context';
import { isUniqueViolation } from '../db/database';
import { badRequest, conflict, notFound } from '../lib/errors';
import { addMinutesLocal, humanDate, isIsoDate, isLocalDateTime, minutesOfDay, toHotelLocal } from '../lib/time';
import type { ReservationRow } from './reservations';
import { insertRequest } from './requests/requests';

// ---------------------------------- Spa ----------------------------------

interface TreatmentRow {
  id: number;
  name: string;
  description: string;
  duration_min: number;
  price_minor: number;
}

export function listTreatments(ctx: AppContext): SpaTreatmentDto[] {
  return ctx.db
    .all<TreatmentRow>('SELECT * FROM spa_treatments ORDER BY sort, id')
    .map((t) => ({ id: t.id, name: t.name, description: t.description, durationMin: t.duration_min, priceMinor: t.price_minor }));
}

function treatment(ctx: AppContext, id: number): TreatmentRow {
  const t = ctx.db.get<TreatmentRow>('SELECT * FROM spa_treatments WHERE id = ?', [id]);
  if (!t) throw notFound('Treatment not found');
  return t;
}

/** The 30-minute slot starts a booking at `start` would occupy. */
function slotUnits(ctx: AppContext, start: string, durationMin: number): string[] {
  const step = ctx.hotel.spa.slotMinutes;
  return Array.from({ length: durationMin / step }, (_, i) => addMinutesLocal(start, i * step));
}

function freeResource(ctx: AppContext, units: string[]): number | null {
  for (let resource = 1; resource <= ctx.hotel.spa.treatmentRooms; resource++) {
    const placeholders = units.map(() => '?').join(',');
    const taken = ctx.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM spa_slot_locks WHERE resource = ? AND slot_start IN (${placeholders})`,
      [resource, ...units],
    );
    if (!taken || taken.n === 0) return resource;
  }
  return null;
}

function assertDateInStay(ctx: AppContext, r: ReservationRow, date: string) {
  if (!isIsoDate(date)) throw badRequest('Date must be YYYY-MM-DD');
  if (date < today(ctx) || date < r.check_in || date > r.check_out) {
    throw badRequest('Pick a date during your stay');
  }
}

export function spaSlots(ctx: AppContext, r: ReservationRow, date: string, treatmentId: number): SpaSlotDto[] {
  assertDateInStay(ctx, r, date);
  const t = treatment(ctx, treatmentId);
  const { opensAt, closesAt, slotMinutes, minLeadMinutes } = ctx.hotel.spa;
  const earliest = addMinutesLocal(toHotelLocal(ctx.clock.now(), ctx.hotel.timezone), minLeadMinutes);
  const slots: SpaSlotDto[] = [];
  // On the check-out day a treatment has to finish by check-out time.
  const lastEnd = date === r.check_out ? Math.min(minutesOfDay(closesAt), minutesOfDay(ctx.hotel.checkOutTime)) : minutesOfDay(closesAt);
  for (let m = minutesOfDay(opensAt); m + t.duration_min <= lastEnd; m += slotMinutes) {
    const start = `${date}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const available = start >= earliest && freeResource(ctx, slotUnits(ctx, start, t.duration_min)) !== null;
    slots.push({ start, end: addMinutesLocal(start, t.duration_min), available });
  }
  return slots;
}

export const SpaBookingSchema = z.object({
  treatmentId: z.number().int().positive(),
  start: z.string().refine(isLocalDateTime, 'start must be YYYY-MM-DDTHH:mm'),
  notes: z.string().trim().max(300).optional(),
});

export function bookSpa(ctx: AppContext, r: ReservationRow, input: z.infer<typeof SpaBookingSchema>) {
  const t = treatment(ctx, input.treatmentId);
  const slot = spaSlots(ctx, r, input.start.slice(0, 10), t.id).find((s) => s.start === input.start);
  if (!slot && input.start.slice(0, 10) === r.check_out && addMinutesLocal(input.start, t.duration_min).slice(11) > ctx.hotel.checkOutTime) {
    throw badRequest(`On your check-out day, treatments need to finish by ${ctx.hotel.checkOutTime}`);
  }
  if (!slot) throw badRequest('That start time is outside spa opening hours');
  if (!slot.available) throw conflict('slot_taken', 'That time is no longer available, please pick another slot');

  return ctx.db.tx(() => {
    const units = slotUnits(ctx, input.start, t.duration_min);
    const resource = freeResource(ctx, units);
    if (resource === null) throw conflict('slot_taken', 'That time is no longer available, please pick another slot');
    const req = insertRequest(ctx, r, {
      service: 'spa',
      title: `Spa, ${t.name}`,
      notes: input.notes,
      details: { treatment: t.name, durationMin: t.duration_min, treatmentRoom: resource },
      items: [{ catalogItemId: null, name: t.name, quantity: 1, unitMinor: t.price_minor }],
      scheduledAt: input.start,
      scheduledEndAt: slot.end,
      charges: [{ category: 'spa', description: `Spa: ${t.name} (${t.duration_min} min)`, quantity: 1, unitMinor: t.price_minor }],
    });
    try {
      for (const u of units) {
        ctx.db.run('INSERT INTO spa_slot_locks (resource, slot_start, request_id) VALUES (?, ?, ?)', [resource, u, req.id]);
      }
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('slot_taken', 'That time is no longer available, please pick another slot');
      throw err;
    }
    return req;
  });
}

// ------------------------------- Transfers -------------------------------

export function transferOptions(ctx: AppContext): TransferOptions {
  return { airports: ctx.hotel.transfers.airports, vehicles: ctx.hotel.transfers.vehicles };
}

export const TransferSchema = z.object({
  direction: z.enum(['to_airport', 'from_airport']),
  airport: z.string(),
  vehicle: z.string(),
  pickupAt: z.string().refine(isLocalDateTime, 'pickupAt must be YYYY-MM-DDTHH:mm'),
  flightNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2}\s?\d{1,4}[A-Z]?$/, 'Flight number looks like EK 203'),
  passengers: z.number().int().min(1).max(12),
  notes: z.string().trim().max(300).optional(),
});

export function bookTransfer(ctx: AppContext, r: ReservationRow, input: z.infer<typeof TransferSchema>) {
  const airport = ctx.hotel.transfers.airports.find((a) => a.code === input.airport);
  const vehicle = ctx.hotel.transfers.vehicles.find((v) => v.code === input.vehicle);
  if (!airport) throw badRequest('Unknown airport');
  if (!vehicle) throw badRequest('Unknown vehicle type');
  if (input.passengers > vehicle.seats) throw badRequest(`${vehicle.name} seats up to ${vehicle.seats} passengers`);

  const date = input.pickupAt.slice(0, 10);
  if (date < today(ctx) || date > r.check_out) throw badRequest('Pick a time between now and your check-out day');
  // An arrival pick-up only makes sense while the guest still has nights left at the hotel.
  if (input.direction === 'from_airport' && date >= r.check_out) {
    throw badRequest(`Airport pick-ups need to be before your check-out day (${humanDate(r.check_out)})`);
  }
  const earliest = addMinutesLocal(toHotelLocal(ctx.clock.now(), ctx.hotel.timezone), ctx.hotel.transfers.minLeadMinutes);
  if (input.pickupAt < earliest) {
    throw badRequest(`Transfers need at least ${ctx.hotel.transfers.minLeadMinutes / 60} hours' notice`);
  }

  const route = input.direction === 'to_airport' ? `Hotel to ${airport.code}` : `${airport.code} to hotel`;
  return insertRequest(ctx, r, {
    service: 'transfer',
    title: `Airport transfer, ${route}`,
    notes: input.notes,
    details: {
      direction: input.direction,
      airport: airport.name,
      airportCode: airport.code,
      vehicle: vehicle.name,
      flightNumber: input.flightNumber.replace(/\s+/, ' '),
      passengers: input.passengers,
    },
    items: [{ catalogItemId: null, name: `${vehicle.name}, ${route}`, quantity: 1, unitMinor: vehicle.priceMinor }],
    scheduledAt: input.pickupAt,
    scheduledEndAt: addMinutesLocal(input.pickupAt, airport.durationMin),
    charges: [{ category: 'transfer', description: `Airport transfer: ${vehicle.name}, ${route}`, quantity: 1, unitMinor: vehicle.priceMinor }],
  });
}
