import { z } from 'zod';
import type { InvoiceDto } from '../../shared/types';
import { nowIso, today, type AppContext } from '../context';
import { conflict, notFound } from '../lib/errors';
import { cardBrand, isValidCardNumber } from '../lib/money';
import { addDays, toHotelLocal } from '../lib/time';
import { computeLiveBill, postEntry } from './billing/folio';
import type { ReservationRow } from './reservations';
import { voidRequest, type ServiceRequestRow } from './requests/requests';
import { getActiveStay, getStay } from './stays';

export const CheckoutSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('card_on_file') }),
  z.object({
    method: z.literal('new_card'),
    holder: z.string().trim().min(1).max(60),
    number: z.string().refine(isValidCardNumber, 'Card number is not valid'),
    expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Use MM/YY'),
  }),
]);
export type CheckoutInput = z.infer<typeof CheckoutSchema>;

/**
 * Express check-out, in one transaction:
 * 1. release unused future nights (early departure) with negative adjustments
 * 2. cancel spa bookings that have not started yet, reversing their charges
 * 3. post the taxes and the payment, freeze the bill into an invoice
 * 4. close the stay and mark the room dirty for housekeeping
 */
export function checkout(ctx: AppContext, stayCodeInput: string, input: CheckoutInput): InvoiceDto {
  const r = getActiveStay(ctx, stayCodeInput);

  const paymentLabel =
    input.method === 'card_on_file'
      ? `${r.card_brand ?? 'Card'} ending ${r.card_last4 ?? '----'}`
      : `${cardBrand(input.number)} ending ${input.number.replace(/\D/g, '').slice(-4)}`;

  return ctx.db.tx(() => {
    const t = today(ctx);
    const now = nowIso(ctx);

    // 1. Early departure: the guest pays for nights up to today (at least one night).
    const keepUntil = [addDays(r.check_in, 1), t].sort().at(-1)!;
    const released = ctx.db.all<{ night: string; rate_minor: number; room_id: number }>(
      'SELECT night, rate_minor, room_id FROM room_nights WHERE reservation_id = ? AND night >= ? ORDER BY night',
      [r.id, keepUntil],
    );
    for (const n of released) {
      postEntry(ctx, {
        reservationId: r.id,
        kind: 'adjustment',
        category: 'room',
        description: 'Early departure: night released',
        quantity: -1,
        unitMinor: n.rate_minor,
        serviceDate: n.night,
        sourceType: 'room_night',
      });
    }
    ctx.db.run('DELETE FROM room_nights WHERE reservation_id = ? AND night >= ?', [r.id, keepUntil]);

    // 2. Spa treatments that have not started are cancelled and refunded.
    const nowLocal = toHotelLocal(ctx.clock.now(), ctx.hotel.timezone);
    const futureSpa = ctx.db.all<ServiceRequestRow>(
      "SELECT * FROM service_requests WHERE reservation_id = ? AND service = 'spa' AND status IN ('requested', 'confirmed') AND scheduled_at > ?",
      [r.id, nowLocal],
    );
    for (const s of futureSpa) voidRequest(ctx, r, s, 'Released at check-out');

    // Leaving early: airport transfers booked for a later day no longer apply.
    if (t < r.check_out) {
      const laterTransfers = ctx.db.all<ServiceRequestRow>(
        "SELECT * FROM service_requests WHERE reservation_id = ? AND service = 'transfer' AND status IN ('requested', 'confirmed', 'driver_assigned') AND substr(scheduled_at, 1, 10) > ?",
        [r.id, t],
      );
      for (const s of laterTransfers) voidRequest(ctx, r, s, 'Released at check-out');
    }

    // 3. Taxes, payment, invoice.
    const bill = computeLiveBill(ctx, r);
    for (const tax of bill.taxes) {
      postEntry(ctx, { reservationId: r.id, kind: 'tax', category: 'tax', description: tax.name, unitMinor: tax.amountMinor, serviceDate: t, sourceType: `tax:${tax.code}` });
    }
    const due = bill.totalMinor - bill.paidMinor;
    if (due !== 0) {
      postEntry(ctx, { reservationId: r.id, kind: 'payment', category: 'payment', description: `Payment, ${paymentLabel}`, unitMinor: -due, serviceDate: t, sourceType: 'payment' });
    }

    const year = t.slice(0, 4);
    const seq = (ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM invoices')?.n ?? 0) + 1;
    const number = `${ctx.hotel.brand.codePrefix}-INV-${year}-${String(seq).padStart(5, '0')}`;
    const room = ctx.db.get<{ number: string }>('SELECT number FROM rooms WHERE id = ?', [r.room_id])!;
    const invoice: InvoiceDto = {
      number,
      issuedAt: now,
      reservationCode: r.code,
      guestName: `${r.first_name} ${r.last_name}`,
      roomNumber: room.number,
      checkIn: r.check_in,
      checkOut: t < r.check_out ? keepUntil : r.check_out,
      bill: {
        ...bill,
        paidMinor: bill.totalMinor,
        balanceMinor: 0,
        isFinal: true,
        notes: released.length ? [`${released.length} unused night(s) released for early departure.`] : [],
      },
      payment: { method: paymentLabel, reference: `PAY-${r.code}` },
    };
    ctx.db.run('INSERT INTO invoices (number, reservation_id, issued_at, total_minor, payload) VALUES (?, ?, ?, ?, ?)', [
      number, r.id, now, bill.totalMinor, JSON.stringify(invoice),
    ]);

    // 4. Close the stay.
    const closed = ctx.db.run(
      "UPDATE reservations SET status = 'checked_out', checked_out_at = ? WHERE id = ? AND status = 'checked_in'",
      [now, r.id],
    );
    if (closed.changes !== 1) throw conflict('stay_closed', 'This stay has already been checked out');
    ctx.db.run("UPDATE rooms SET housekeeping_status = 'dirty', dirty_since = ? WHERE id = ?", [now, r.room_id]);
    return invoice;
  });
}

export function getInvoice(ctx: AppContext, stayCodeInput: string): { invoice: InvoiceDto; reservation: ReservationRow } {
  const r = getStay(ctx, stayCodeInput);
  const row = ctx.db.get<{ payload: string }>('SELECT payload FROM invoices WHERE reservation_id = ?', [r.id]);
  if (!row) throw notFound('No invoice yet. It is issued at check-out.');
  return { invoice: JSON.parse(row.payload) as InvoiceDto, reservation: r };
}
