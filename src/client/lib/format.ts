let locale = 'en-AE';
let currency = 'AED';

export function configureFormat(l: string, c: string) {
  locale = l;
  currency = c;
}

export function money(minor: number, opts: { whole?: boolean } = {}): string {
  const digits = opts.whole && minor % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 100);
}

const asDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);

/** "Thu 19 Nov" */
export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(asDate(iso));
}

/** "19 Nov 2026" */
export function longDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(asDate(iso));
}

/** Hotel-local "YYYY-MM-DDTHH:mm" to "Fri 20 Nov, 16:00" */
export function localDateTime(local: string): string {
  return `${shortDate(local)}, ${local.slice(11, 16)}`;
}

/** UTC ISO timestamp shown in the hotel's time zone, e.g. "14:05". */
export function timeOf(isoUtc: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(isoUtc));
}

/** Current hotel-local wall-clock time as YYYY-MM-DDTHH:mm (same format as spa and transfer times). */
export function hotelNowLocal(timeZone: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** A spa or transfer booking whose booked time has not started yet. */
export function isUpcoming(r: { scheduledAt: string | null; isFinal: boolean; isCancelled: boolean }, timeZone: string): boolean {
  return Boolean(r.scheduledAt) && !r.isFinal && !r.isCancelled && r.scheduledAt! > hotelNowLocal(timeZone);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nightsBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function formatCardNumber(v: string): string {
  return v
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function formatExpiry(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}
