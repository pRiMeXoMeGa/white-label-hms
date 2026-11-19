import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TaxRuleConfig } from '../src/server/config/hotel';
import { isValidCardNumber, percentOf } from '../src/server/lib/money';
import { computeTaxes } from '../src/server/modules/billing/tax';

const rules: TaxRuleConfig[] = [
  { type: 'percent', code: 'SC', name: 'Service charge', ratePercent: 10, appliesTo: ['room', 'food', 'spa'], compoundOn: [] },
  { type: 'percent', code: 'MF', name: 'Municipality fee', ratePercent: 7, appliesTo: ['room', 'food'], compoundOn: [] },
  { type: 'per_room_night', code: 'TD', name: 'Tourism Dirham', amountMinor: 1500 },
  { type: 'percent', code: 'VAT', name: 'VAT', ratePercent: 5, appliesTo: ['room', 'food', 'spa'], compoundOn: ['SC', 'MF'] },
];

test('UAE-style stack: VAT is charged on the net amount plus service charge and municipality fee', () => {
  const taxes = computeTaxes(rules, [
    { category: 'room', amountMinor: 100_000 },
    { category: 'spa', amountMinor: 50_000 },
  ], 2);
  const by = Object.fromEntries(taxes.map((t) => [t.code, t.amountMinor]));
  assert.equal(by.SC, 15_000); // 10% of 1,500.00
  assert.equal(by.MF, 7_000); // 7% of the room only
  assert.equal(by.TD, 3_000); // 2 nights x 15.00
  assert.equal(by.VAT, 8_600); // 5% of (1,500 + 150 + 70)
});

test('adjustments reduce the tax basis and empty bases produce no tax line', () => {
  const taxes = computeTaxes(rules, [
    { category: 'food', amountMinor: 9_000 },
    { category: 'food', amountMinor: -9_000 },
  ], 0);
  assert.deepEqual(taxes, []);
});

test('rounding happens once per tax, half away from zero', () => {
  assert.equal(percentOf(1_005, 10), 101); // 100.5 -> 101
  assert.equal(percentOf(-1_005, 10), -101);
  const [sc] = computeTaxes(rules.slice(0, 1), [
    { category: 'food', amountMinor: 333 },
    { category: 'food', amountMinor: 333 },
    { category: 'food', amountMinor: 333 },
  ], 0);
  assert.equal(sc!.amountMinor, 100); // 10% of 999 = 99.9 -> 100, not 3 x 33
});

test('card numbers are Luhn-checked', () => {
  assert.equal(isValidCardNumber('4242 4242 4242 4242'), true);
  assert.equal(isValidCardNumber('4242 4242 4242 4241'), false);
  assert.equal(isValidCardNumber('1234'), false);
});
