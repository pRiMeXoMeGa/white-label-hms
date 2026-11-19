/**
 * Percentage of an amount in minor units, rounded half away from zero. Computed in integers
 * (the rate in hundredths of a percent) so a rate like 0.7% never rounds the wrong way.
 */
export function percentOf(amountMinor: number, ratePercent: number): number {
  const hundredths = Math.round(ratePercent * 100); // 7% -> 700, 0.7% -> 70
  const product = Math.abs(amountMinor) * hundredths; // exact for amounts under ~9e11
  const q = Math.floor(product / 10_000);
  const roundedUp = (product % 10_000) * 2 >= 10_000 ? q + 1 : q;
  return amountMinor < 0 ? -roundedUp : roundedUp;
}

export function multiplyRate(amountMinor: number, multiplier: number): number {
  return Math.round(amountMinor * multiplier);
}

export const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** Luhn checksum, used to validate the (mock) card number at the edge. */
export function isValidCardNumber(input: string): boolean {
  const digits = input.replace(/[\s-]/g, '');
  if (!/^\d{12,19}$/.test(digits)) return false;
  let total = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    total += d;
  }
  return total % 10 === 0;
}

/** MM/YY that is this month or later (a card is valid until the end of its expiry month). */
export function isCardExpiryValid(input: string, now = new Date()): boolean {
  const m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(input.trim());
  if (!m) return false;
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  return year > now.getUTCFullYear() || (year === now.getUTCFullYear() && month >= now.getUTCMonth() + 1);
}

export function cardBrand(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (/^4/.test(digits)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'American Express';
  return 'Card';
}
