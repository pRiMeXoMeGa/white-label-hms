import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeLiveBill, getBill } from '../src/server/modules/billing/folio';
import { renderInvoicePdf } from '../src/server/modules/billing/invoice-pdf';
import { checkout } from '../src/server/modules/checkout';
import { createReservation } from '../src/server/modules/reservations';
import {
  advanceDueRequests,
  cancelRequest,
  createCatalogOrder,
  finishHousekeepingTurnarounds,
  getRequestRow,
} from '../src/server/modules/requests/requests';
import { bookSpa, bookTransfer, spaSlots } from '../src/server/modules/scheduled-services';
import { checkIn, getStay, leaveFeedback } from '../src/server/modules/stays';
import { bookingInput, checkedInGuest, expectHttpError, hotel, itemId, makeCtx } from './helpers';

test('check-in issues a Stay ID and posts one room charge per night', () => {
  const { ctx } = makeCtx();
  const stay = checkedInGuest(ctx);
  assert.match(stay.stay_code!, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const bill = computeLiveBill(ctx, stay);
  assert.deepEqual(bill.lines.map((l) => [l.date, l.amountMinor]), [['2026-03-02', 65_000], ['2026-03-03', 65_000]]);
  // Same credentials again return the same stay instead of failing.
  const again = checkIn(ctx, { code: stay.code, lastName: 'Khan', nationality: 'India', idType: 'passport', idNumber: 'Z1234567', acceptTerms: true });
  assert.equal(again.stay_code, stay.stay_code);
  assert.equal(again.id_last4, '4567', 'only the last 4 characters of the document are stored');
});

test('online check-in opens on arrival day, or earlier with EARLY_CHECKIN_DAYS', () => {
  const { ctx } = makeCtx();
  const future = createReservation(ctx, bookingInput({ checkIn: '2026-03-05', checkOut: '2026-03-06' }));
  const args = { code: future.code, lastName: 'Khan', nationality: 'UAE', idType: 'emirates_id' as const, idNumber: '784199912345', acceptTerms: true as const };
  expectHttpError(() => checkIn(ctx, args), 422, 'too_early');

  const early = makeCtx({ env: { EARLY_CHECKIN_DAYS: '3' } }).ctx;
  const r = createReservation(early, bookingInput({ checkIn: '2026-03-05', checkOut: '2026-03-06' }));
  assert.equal(checkIn(early, { ...args, code: r.code }).status, 'checked_in');
});

test('orders post to the folio; laundry express adds its surcharge; free services cost nothing', () => {
  const { ctx } = makeCtx();
  const stay = checkedInGuest(ctx);
  createCatalogOrder(ctx, stay, 'food', { items: [{ itemId: itemId(ctx, 'BRK-SHAK'), quantity: 2 }, { itemId: itemId(ctx, 'BRK-SHAK'), quantity: 1 }] });
  const laundry = createCatalogOrder(ctx, stay, 'laundry', { items: [{ itemId: itemId(ctx, 'LND-SHIRT'), quantity: 3 }], express: true });
  const pillow = createCatalogOrder(ctx, stay, 'amenity', { items: [{ itemId: itemId(ctx, 'AM-PILLOW'), quantity: 1 }] });
  assert.equal(laundry.total_minor, 9_000); // 3 x 20.00 + 50%
  assert.equal(pillow.total_minor, 0);
  const bill = computeLiveBill(ctx, stay);
  const food = bill.lines.find((l) => l.category === 'food')!;
  assert.equal(food.quantity, 3, 'duplicate lines are merged');
  assert.equal(bill.subtotalMinor, 130_000 + 14_400 + 9_000);
  expectHttpError(() => createCatalogOrder(ctx, stay, 'food', { items: [{ itemId: itemId(ctx, 'LND-SHIRT'), quantity: 1 }] }), 400);
});

test('auto-advance follows AUTO_ADVANCE_SECONDS_<SERVICE> and records each status', () => {
  const { ctx, clock } = makeCtx({ env: { AUTO_ADVANCE_SECONDS: '60', AUTO_ADVANCE_SECONDS_FOOD: '120' } });
  const stay = checkedInGuest(ctx);
  const food = createCatalogOrder(ctx, stay, 'food', { items: [{ itemId: itemId(ctx, 'DRK-KARAK'), quantity: 1 }] });
  const towels = createCatalogOrder(ctx, stay, 'housekeeping', { items: [{ itemId: itemId(ctx, 'HK-TOWELS'), quantity: 1 }] });

  clock.advanceSeconds(61);
  advanceDueRequests(ctx);
  assert.equal(getRequestRow(ctx, food.id)!.status, 'received', 'food waits 120 s');
  assert.equal(getRequestRow(ctx, towels.id)!.status, 'in_progress');

  for (let i = 0; i < 5; i++) {
    clock.advanceSeconds(120);
    advanceDueRequests(ctx);
  }
  const done = getRequestRow(ctx, food.id)!;
  assert.equal(done.status, 'delivered');
  assert.equal(done.next_transition_at, null, 'terminal requests are no longer scheduled');
  assert.equal(getRequestRow(ctx, towels.id)!.status, 'completed');
  const events = ctx.db.all<{ status: string }>('SELECT status FROM service_request_events WHERE request_id = ? ORDER BY id', [food.id]);
  assert.deepEqual(events.map((e) => e.status), ['received', 'preparing', 'on_the_way', 'delivered']);
});

test('a request can be cancelled only before work starts, and its charge is reversed', () => {
  const { ctx, clock } = makeCtx();
  const stay = checkedInGuest(ctx);
  const a = createCatalogOrder(ctx, stay, 'food', { items: [{ itemId: itemId(ctx, 'MAIN-BURG'), quantity: 1 }] });
  cancelRequest(ctx, stay, a.id);
  const bill = computeLiveBill(ctx, stay);
  assert.equal(bill.byCategory.find((c) => c.category === 'food'), undefined, 'charge and reversal net to zero');

  const b = createCatalogOrder(ctx, stay, 'food', { items: [{ itemId: itemId(ctx, 'MAIN-BURG'), quantity: 1 }] });
  clock.advanceSeconds(61);
  advanceDueRequests(ctx);
  expectHttpError(() => cancelRequest(ctx, stay, b.id), 409, 'not_cancellable');
});

test('folio entries are append-only at the database level', () => {
  const { ctx } = makeCtx();
  checkedInGuest(ctx);
  assert.throws(() => ctx.db.run('UPDATE folio_entries SET amount_minor = 0'), /append-only/);
  assert.throws(() => ctx.db.run('DELETE FROM folio_entries'), /append-only/);
});

test('spa: three treatment rooms per slot, lead time enforced, completes after its slot', () => {
  const { ctx, clock } = makeCtx(); // 10:00 local
  const stay = checkedInGuest(ctx);
  const swedish = ctx.db.get<{ id: number }>("SELECT id FROM spa_treatments WHERE code = 'SPA-SWEDISH'")!.id;
  const slots = spaSlots(ctx, stay, '2026-03-02', swedish);
  assert.equal(slots.find((s) => s.start === '2026-03-02T10:30')!.available, false, 'needs 60 min notice');
  assert.equal(slots.find((s) => s.start === '2026-03-02T11:00')!.available, true);
  assert.equal(slots.at(-1)!.start, '2026-03-02T21:00', 'last 60-min slot ends at closing');

  for (let i = 0; i < 3; i++) bookSpa(ctx, stay, { treatmentId: swedish, start: '2026-03-02T15:00' });
  expectHttpError(() => bookSpa(ctx, stay, { treatmentId: swedish, start: '2026-03-02T15:30' }), 409, 'slot_taken');
  assert.doesNotThrow(() => bookSpa(ctx, stay, { treatmentId: swedish, start: '2026-03-02T16:00' }));

  clock.set('2026-03-02T12:05:00Z'); // 16:05 local, after the 15:00 treatments ended
  advanceDueRequests(ctx); // requested -> confirmed
  advanceDueRequests(ctx); // confirmed -> completed (slot end has passed)
  const first = ctx.db.get<{ status: string }>("SELECT status FROM service_requests WHERE service = 'spa' ORDER BY id LIMIT 1")!;
  assert.equal(first.status, 'completed');
});

test('transfers need notice and a car big enough', () => {
  const { ctx } = makeCtx();
  const stay = checkedInGuest(ctx);
  const base = { direction: 'to_airport' as const, airport: 'DXB', vehicle: 'sedan', flightNumber: 'EK 203', passengers: 2 };
  expectHttpError(() => bookTransfer(ctx, stay, { ...base, pickupAt: '2026-03-02T11:00' }), 400);
  expectHttpError(() => bookTransfer(ctx, stay, { ...base, passengers: 5, pickupAt: '2026-03-04T09:00' }), 400);
  const t = bookTransfer(ctx, stay, { ...base, pickupAt: '2026-03-04T09:00' });
  assert.equal(t.total_minor, hotel.transfers.vehicles.find((v) => v.code === 'sedan')!.priceMinor);
  assert.equal(t.scheduled_end_at, '2026-03-04T09:35');
});

test('early check-out releases unused nights, refunds future spa, freezes an invoice', async () => {
  const { ctx } = makeCtx();
  const stay = checkedInGuest(ctx, { checkIn: '2026-03-02', checkOut: '2026-03-05' }); // 3 nights booked
  createCatalogOrder(ctx, stay, 'food', { items: [{ itemId: itemId(ctx, 'MAIN-BURG'), quantity: 1 }] });
  const swedish = ctx.db.get<{ id: number }>("SELECT id FROM spa_treatments WHERE code = 'SPA-SWEDISH'")!.id;
  bookSpa(ctx, stay, { treatmentId: swedish, start: '2026-03-03T18:00' });

  const invoice = checkout(ctx, stay.stay_code!, { method: 'card_on_file' });

  const room = invoice.bill.byCategory.find((c) => c.category === 'room')!.amountMinor;
  assert.equal(room, 65_000, 'leaving on arrival day still pays one night');
  assert.equal(invoice.bill.byCategory.find((c) => c.category === 'spa'), undefined, 'future spa refunded');
  const td = invoice.bill.taxes.find((t) => t.code === 'TD');
  assert.equal(td?.kind === 'per_room_night' && td.roomNights, 1);
  assert.equal(invoice.bill.balanceMinor, 0);
  assert.match(invoice.number, /^SB-INV-2026-00001$/);

  const closed = getStay(ctx, stay.stay_code!);
  assert.equal(closed.status, 'checked_out');
  assert.deepEqual(getBill(ctx, closed), invoice.bill, 'the bill is read from the frozen invoice');
  const nights = ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM room_nights WHERE reservation_id = ?', [stay.id])!.n;
  assert.equal(nights, 1, 'released nights are back on sale');
  expectHttpError(() => checkout(ctx, stay.stay_code!, { method: 'card_on_file' }), 409, 'stay_closed');

  const pdf = await renderInvoicePdf(hotel, invoice);
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-');

  leaveFeedback(ctx, stay.stay_code!, { rating: 5, comment: 'Lovely' });
  expectHttpError(() => leaveFeedback(ctx, stay.stay_code!, { rating: 4 }), 409, 'feedback_exists');
});

test('rooms left dirty at check-out are cleaned after HOUSEKEEPING_TURNAROUND_SECONDS', () => {
  const { ctx, clock } = makeCtx({ env: { HOUSEKEEPING_TURNAROUND_SECONDS: '600' } });
  const stay = checkedInGuest(ctx);
  checkout(ctx, stay.stay_code!, { method: 'card_on_file' });
  const status = () => ctx.db.get<{ s: string }>('SELECT housekeeping_status AS s FROM rooms WHERE id = ?', [stay.room_id])!.s;
  assert.equal(status(), 'dirty');
  clock.advanceSeconds(599);
  finishHousekeepingTurnarounds(ctx);
  assert.equal(status(), 'dirty');
  clock.advanceSeconds(2);
  finishHousekeepingTurnarounds(ctx);
  assert.equal(status(), 'clean');
});
