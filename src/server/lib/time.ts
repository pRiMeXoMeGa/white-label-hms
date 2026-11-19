// Date helpers. Stay dates are plain calendar dates (YYYY-MM-DD) in the hotel's time zone;
// spa and transfer times are hotel-local wall-clock times (YYYY-MM-DDTHH:mm); system
// timestamps (created_at, next_transition_at) are UTC ISO strings.

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now() {
    return new Date(this.current);
  }
  set(iso: string) {
    this.current = new Date(iso);
  }
  advanceSeconds(s: number) {
    this.current = new Date(this.current.getTime() + s * 1000);
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function isIsoDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isLocalDateTime(s: string): boolean {
  return LOCAL_DT_RE.test(s) && isIsoDate(s.slice(0, 10)) && Number(s.slice(11, 13)) < 24 && Number(s.slice(14, 16)) < 60;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Every night of a stay: [checkIn, checkOut). */
export function nightsOf(checkIn: string, checkOut: string): string[] {
  const n = daysBetween(checkIn, checkOut);
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDays(checkIn, i));
}

export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function partsInZone(instant: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(instant).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, second: p.second ?? '00' };
}

/** Calendar date at the hotel right now. */
export function hotelToday(clock: Clock, timeZone: string): string {
  return partsInZone(clock.now(), timeZone).date;
}

/** Hotel-local wall-clock time for an instant, as YYYY-MM-DDTHH:mm. */
export function toHotelLocal(instant: Date, timeZone: string): string {
  const p = partsInZone(instant, timeZone);
  return `${p.date}T${p.time}`;
}

/** Converts hotel-local wall-clock time to a UTC instant (handles any fixed or DST zone). */
export function hotelLocalToUtc(local: string, timeZone: string): Date {
  const asIfUtc = Date.parse(`${local}:00Z`);
  // Two passes resolve the offset correctly around DST changes.
  let guess = asIfUtc;
  for (let i = 0; i < 2; i++) {
    const p = partsInZone(new Date(guess), timeZone);
    const shown = Date.parse(`${p.date}T${p.time}:${p.second}Z`);
    guess += asIfUtc - shown;
  }
  return new Date(guess);
}

export function addMinutesLocal(local: string, minutes: number): string {
  const d = new Date(Date.parse(`${local}:00Z`) + minutes * 60_000);
  return d.toISOString().slice(0, 16);
}

export function minutesOfDay(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}
