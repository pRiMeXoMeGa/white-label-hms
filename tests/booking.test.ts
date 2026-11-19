import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchAvailability } from '../src/server/modules/availability';
import { cancelReservation, createReservation, findReservation } from '../src/server/modules/reservations';
import { bookingInput, expectHttpError, makeCtx } from './helpers';

const deluxeAvailable = (ctx: ReturnType<typeof makeCtx>['ctx'], checkIn = '2026-03-02', checkOut = '2026-03-04') =>
  searchAvailability(ctx, { checkIn, checkOut, adults: 2, children: 0 }).options.find((o) => o.roomType.slug === 'deluxe-king')!
    .available;

test('availability drops as rooms are sold and the type sells out, never overbooks', () => {
  const { ctx } = makeCtx();
  assert.equal(deluxeAvailable(ctx), 6);
  for (let i = 0; i < 6; i++) createReservation(ctx, bookingInput());
  assert.equal(deluxeAvailable(ctx), 0);
  expectHttpError(() => createReservation(ctx, bookingInput()), 409, 'sold_out');
  // Overlapping by one night is also refused; back-to-back stays are fine.
  expectHttpError(() => createReservation(ctx, bookingInput({ checkIn: '2026-03-03', checkOut: '2026-03-05' })), 409, 'sold_out');
  assert.doesNotThrow(() => createReservation(ctx, bookingInput({ checkIn: '2026-03-04', checkOut: '2026-03-06' })));
});

test('the database itself rejects a second sale of the same room-night', () => {
  const { ctx } = makeCtx();
  const r = createReservation(ctx, bookingInput());
  assert.throws(
    () => ctx.db.run('INSERT INTO room_nights (room_id, night, reservation_id, rate_minor) VALUES (?, ?, ?, 1)', [r.room_id, '2026-03-02', r.id]),
    /UNIQUE constraint failed/,
  );
});

test('weekend nights are priced with the configured uplift', () => {
  const { ctx } = makeCtx();
  // Thu 5 and Fri 6 March are weekend nights in the config (x1.2).
  const res = searchAvailability(ctx, { checkIn: '2026-03-04', checkOut: '2026-03-07', adults: 2, children: 0 });
  const king = res.options.find((o) => o.roomType.slug === 'deluxe-king')!;
  assert.deepEqual(king.nightly.map((n) => n.rateMinor), [65_000, 78_000, 78_000]);
  assert.equal(king.totalMinor, 221_000);
});

test('input rules: no past dates, party must fit, card must be valid', () => {
  const { ctx } = makeCtx();
  expectHttpError(() => createReservation(ctx, bookingInput({ checkIn: '2026-03-01' })), 400);
  expectHttpError(() => createReservation(ctx, bookingInput({ checkOut: '2026-03-02' })), 400);
  expectHttpError(() => createReservation(ctx, bookingInput({ adults: 3 })), 422, 'party_too_large');
});

test('lookup needs the matching last name; cancelling frees the room', () => {
  const { ctx } = makeCtx();
  const r = createReservation(ctx, bookingInput());
  expectHttpError(() => findReservation(ctx, r.code, 'Smith'), 404);
  assert.equal(findReservation(ctx, r.code.toLowerCase(), ' KHAN ').id, r.id);
  assert.equal(deluxeAvailable(ctx), 5);
  assert.equal(cancelReservation(ctx, r.code, 'Khan').status, 'cancelled');
  assert.equal(deluxeAvailable(ctx), 6);
  expectHttpError(() => cancelReservation(ctx, r.code, 'Khan'), 409, 'not_cancellable');
});
