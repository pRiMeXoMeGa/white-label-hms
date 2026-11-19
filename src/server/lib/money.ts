/** Percentage of an amount in minor units, rounded half away from zero. */
export function percentOf(amountMinor: number, ratePercent: number): number {
  const raw = (amountMinor * ratePercent) / 100;
  return Math.sign(raw) * Math.round(Math.abs(raw));
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

export function cardBrand(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (/^4/.test(digits)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'American Express';
  return 'Card';
}
