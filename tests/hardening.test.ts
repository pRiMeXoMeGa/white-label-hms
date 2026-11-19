import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { loadConfig } from '../src/server/config/env';
import { parse } from '../src/server/http/router';
import { clientIp, createHttpServer } from '../src/server/http/server';
import { isCardExpiryValid, percentOf } from '../src/server/lib/money';
import { checkout, checkoutPreview } from '../src/server/modules/checkout';
import { CreateReservationSchema, toReservationDto } from '../src/server/modules/reservations';
import { CatalogOrderSchema, createCatalogOrder } from '../src/server/modules/requests/requests';
import { bookSpa, bookTransfer, spaSlots } from '../src/server/modules/scheduled-services';
import { CheckInSchema, assertStayOpen, getStay, toStayDto } from '../src/server/modules/stays';
import { bookingInput, checkedInGuest, expectHttpError, itemId, makeCtx } from './helpers';

const quiet = () => undefined;

async function withServer(env: Record<string, string>, fn: (base: string, ctx: ReturnType<typeof makeCtx>['ctx']) => Promise<void>) {
  const { ctx } = makeCtx({ env });
  const server = createHttpServer(ctx, quiet);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await fn(base, ctx);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

test('a malformed address gets a 400 and the server keeps answering', async () => {
  await withServer({}, async (base) => {
    const bad = await fetch(`${base}/api/stays/%E0%A4%A`);
    assert.equal(bad.status, 400);
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    const wrongType = await fetch(`${base}/api/check-in`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
    assert.equal(wrongType.status, 415);
  });
});

test('client address is read from the right of X-Forwarded-For, as many hops as trusted', () => {
  const req = (xff?: string) =>
    ({ headers: xff ? { 'x-forwarded-for': xff } : {}, socket: { remoteAddress: '10.0.0.9' } }) as unknown as IncomingMessage;
  assert.equal(clientIp(req('6.6.6.6, 1.1.1.1, 2.2.2.2'), 1), '2.2.2.2', 'a spoofed left-most entry is ignored');
  assert.equal(clientIp(req('1.1.1.1, 2.2.2.2'), 2), '1.1.1.1');
  assert.equal(clientIp(req('1.1.1.1'), 0), '10.0.0.9', 'no trusted proxy: the socket address');
  assert.equal(clientIp(req(), 1), '10.0.0.9');
  // Render: Cloudflare, then Render's proxy, so the header ends "client, cloudflare".
  assert.equal(loadConfig({ RENDER: 'true' }).trustProxyHops, 2);
  assert.equal(loadConfig({}).trustProxyHops, 1);
  assert.equal(loadConfig({ RENDER: 'true', TRUST_PROXY_HOPS: '1' }).trustProxyHops, 1);
  assert.equal(clientIp(req('6.6.6.6, 81.2.3.4, 104.22.17.40'), 2), '81.2.3.4');
});

test('only failed lookups count toward the lookup block, and known Stay IDs keep working', async () => {
  await withServer({ RATE_LIMIT_PER_MINUTE: '3' }, async (base, ctx) => {
    const stay = checkedInGuest(ctx);
    for (let i = 0; i < 5; i++) assert.equal((await fetch(`${base}/api/stays/${stay.stay_code}`)).status, 200);
    for (let i = 0; i < 3; i++) assert.equal((await fetch(`${base}/api/stays/AAAA-BBBB-CCCC`)).status, 404);
    assert.equal((await fetch(`${base}/api/stays/AAAA-BBBB-CCCC`)).status, 429);
    assert.equal((await fetch(`${base}/api/stays/${stay.stay_code}`)).status, 200, 'the guest is not locked out');
  });
});

test('per-item quantity is capped after duplicate lines are merged', () => {
  const { ctx } = makeCtx();
  const stay = checkedInGuest(ctx);
  const tea = itemId(ctx, 'DRK-KARAK');
  expectHttpError(() => createCatalogOrder(ctx, stay, 'food', { items: [{ itemId: tea, quantity: 15 }, { itemId: tea, quantity: 10 }] }), 400);
  assert.equal(createCatalogOrder(ctx, stay, 'food', { items: [{ itemId: tea, quantity: 10 }, { itemId: tea, quantity: 10 }] }).status, 'received');
});

test('body rules: real numbers, real clock times, no expired cards, blank optional fields ignored', () => {
  const now = new Date('2026-11-19T10:00:00Z');
  assert.equal(isCardExpiryValid('11/26', now), true, 'valid until the end of its month');
  assert.equal(isCardExpiryValid('10/26', now), false);
  assert.equal(CreateReservationSchema.safeParse({ ...bookingInput(), card: { holder: 'A K', number: '4242424242424242', expiry: '01/20' } }).success, false);
  assert.equal(CreateReservationSchema.safeParse({ ...bookingInput(), adults: '2' }).success, false, 'numbers are not coerced from strings');

  const checkInBody = { code: 'SB-ABCDEF', lastName: 'Khan', nationality: 'India', idType: 'passport', idNumber: 'Z1234567', acceptTerms: true };
  assert.equal(CheckInSchema.safeParse({ ...checkInBody, arrivalTime: '25:00' }).success, false);
  assert.equal(CheckInSchema.safeParse({ ...checkInBody, arrivalTime: '23:59' }).success, true);
  assert.equal(parse(CheckInSchema, { ...checkInBody, arrivalTime: '' }).arrivalTime, undefined);
  assert.equal(CatalogOrderSchema.safeParse({ items: [{ itemId: 1, quantity: 1 }], pickupTime: '9:5' }).success, false);
});

test('after check-out time on the last day, new requests stop but check-out still works', () => {
  const { ctx, clock } = makeCtx();
  const stay = checkedInGuest(ctx); // 2 to 4 Mar, check-out by 12:00
  clock.set('2026-03-04T07:59:00Z'); // 11:59 in Dubai
  assertStayOpen(ctx, getStay(ctx, stay.stay_code!));
  assert.equal(toStayDto(ctx, getStay(ctx, stay.stay_code!)).overdue, false);
  clock.set('2026-03-04T08:00:00Z'); // 12:00
  expectHttpError(() => assertStayOpen(ctx, getStay(ctx, stay.stay_code!)), 409, 'stay_ended');
  assert.equal(toStayDto(ctx, getStay(ctx, stay.stay_code!)).overdue, true);
  assert.match(checkout(ctx, stay.stay_code!, { method: 'card_on_file' }).number, /-INV-2026-00001$/);
});

test('invoice numbers come from a per-year counter', () => {
  const { ctx, clock } = makeCtx({ now: '2026-12-30T06:00:00Z' });
  const a = checkedInGuest(ctx, { checkIn: '2026-12-30', checkOut: '2026-12-31' });
  const b = checkedInGuest(ctx, { checkIn: '2026-12-30', checkOut: '2026-12-31', guest: { ...bookingInput().guest, lastName: 'Ali' } });
  const c = checkedInGuest(ctx, { checkIn: '2026-12-30', checkOut: '2027-01-02', guest: { ...bookingInput().guest, lastName: 'Rao' } });
  assert.equal(checkout(ctx, a.stay_code!, { method: 'card_on_file' }).number, 'SB-INV-2026-00001');
  assert.equal(checkout(ctx, b.stay_code!, { method: 'card_on_file' }).number, 'SB-INV-2026-00002');
  clock.set('2027-01-01T06:00:00Z');
  assert.equal(checkout(ctx, c.stay_code!, { method: 'card_on_file' }).number, 'SB-INV-2027-00001');
});

test('percentages are computed in whole numbers, so decimal rates round correctly', () => {
  assert.equal(percentOf(3000, 4.35), 131, '130.5 rounds up (floating point would give 130)');
  assert.equal(percentOf(1000, 0.7), 7);
  assert.equal(percentOf(5, 10), 1);
  assert.equal(percentOf(-5, 10), -1);
  assert.equal(percentOf(0, 5), 0);
});

test('the check-out preview matches check-out exactly and changes nothing', () => {
  const { ctx, clock } = makeCtx({ now: '2026-03-02T06:00:00Z' });
  const stay = checkedInGuest(ctx, { checkOut: '2026-03-05' });
  createCatalogOrder(ctx, stay, 'food', { items: [{ itemId: itemId(ctx, 'DRK-KARAK'), quantity: 2 }] });
  clock.set('2026-03-03T06:00:00Z'); // leaving a day early
  const count = () => ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM folio_entries')!.n;
  const before = count();
  const preview = checkoutPreview(ctx, stay.stay_code!);
  assert.equal(count(), before, 'no folio entries written');
  assert.equal(getStay(ctx, stay.stay_code!).status, 'checked_in');
  assert.equal(ctx.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM invoice_sequences')!.n, 0, 'no invoice number used');
  assert.equal(preview.nightsReleased, 2);
  const invoice = checkout(ctx, stay.stay_code!, { method: 'card_on_file' });
  assert.equal(invoice.bill.totalMinor, preview.dueMinor);
  assert.equal(invoice.number, 'SB-INV-2026-00001');
});

test('early check-out shortens the reservation to the nights charged', () => {
  const { ctx, clock } = makeCtx();
  const stay = checkedInGuest(ctx, { checkOut: '2026-03-05' }); // 3 nights at 650.00
  clock.set('2026-03-03T06:00:00Z');
  checkout(ctx, stay.stay_code!, { method: 'card_on_file' });
  const r = getStay(ctx, stay.stay_code!);
  assert.equal(r.check_out, '2026-03-03');
  assert.equal(r.room_total_minor, 65_000);
  assert.equal(toReservationDto(ctx, r).stayCode, stay.stay_code, 'the Stay ID stays visible for the invoice');
  assert.equal(toStayDto(ctx, r).nights, 1);
});

test('check-out day: spa must finish by check-out time, arrivals pick-ups are refused, departures allowed', () => {
  const { ctx } = makeCtx();
  const stay = checkedInGuest(ctx); // 2 to 4 Mar
  const swedish = ctx.db.get<{ id: number }>("SELECT id FROM spa_treatments WHERE name LIKE 'Swedish%'")!.id;
  const lastDay = spaSlots(ctx, stay, '2026-03-04', swedish);
  assert.ok(lastDay.length > 0);
  assert.ok(lastDay.every((s) => s.end.slice(11) <= '12:00'));
  expectHttpError(() => bookSpa(ctx, stay, { treatmentId: swedish, start: '2026-03-04T11:30' }), 400);

  const base = { airport: 'DXB', vehicle: 'sedan', flightNumber: 'EK 203', passengers: 1 } as const;
  expectHttpError(() => bookTransfer(ctx, stay, { ...base, direction: 'from_airport', pickupAt: '2026-03-04T09:00' }), 400);
  assert.equal(bookTransfer(ctx, stay, { ...base, direction: 'to_airport', pickupAt: '2026-03-04T18:00' }).service, 'transfer');
});
