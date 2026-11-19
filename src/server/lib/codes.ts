import { randomInt } from 'node:crypto';

// Unambiguous alphabet: no 0/O, 1/I/L, so codes can be read out over the phone.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomChars(n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Booking reference shown to the guest, e.g. SB-7K3QXA (31^6 ≈ 887M combinations). */
export function reservationCode(prefix: string): string {
  return `${prefix}-${randomChars(6)}`;
}

/**
 * Stay ID issued at check-in; it is the guest's key to the in-stay app, so it is long
 * enough (31^12 ≈ 7.9e17, ~59 bits) to be unguessable, and lookups are rate-limited.
 */
export function stayCode(): string {
  const raw = randomChars(12);
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}
