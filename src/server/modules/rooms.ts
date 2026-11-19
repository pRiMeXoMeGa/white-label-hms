import type { NightPrice, RoomTypeDto } from '../../shared/types';
import type { AppContext } from '../context';
import { multiplyRate } from '../lib/money';
import { dayOfWeek, nightsOf } from '../lib/time';

export interface RoomTypeRow {
  id: number;
  slug: string;
  name: string;
  description: string;
  base_rate_minor: number;
  max_adults: number;
  max_children: number;
  size_sqm: number;
  bed: string;
  view: string;
  amenities: string;
}

export function toRoomTypeDto(r: RoomTypeRow): RoomTypeDto {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    baseRateMinor: r.base_rate_minor,
    maxAdults: r.max_adults,
    maxChildren: r.max_children,
    sizeSqm: r.size_sqm,
    bed: r.bed,
    view: r.view,
    amenities: JSON.parse(r.amenities) as string[],
  };
}

export function listRoomTypes(ctx: AppContext): RoomTypeRow[] {
  return ctx.db.all<RoomTypeRow>('SELECT * FROM room_types ORDER BY sort, id');
}

export function getRoomType(ctx: AppContext, idOrSlug: number | string): RoomTypeRow | undefined {
  return typeof idOrSlug === 'number'
    ? ctx.db.get<RoomTypeRow>('SELECT * FROM room_types WHERE id = ?', [idOrSlug])
    : ctx.db.get<RoomTypeRow>('SELECT * FROM room_types WHERE slug = ?', [idOrSlug]);
}

/** Nightly price list: base rate, uplifted on configured weekend nights. */
export function priceStay(ctx: AppContext, rt: RoomTypeRow, checkIn: string, checkOut: string): NightPrice[] {
  const { nights: weekendNights, rateMultiplier } = ctx.hotel.weekend;
  return nightsOf(checkIn, checkOut).map((date) => ({
    date,
    rateMinor: weekendNights.includes(dayOfWeek(date))
      ? multiplyRate(rt.base_rate_minor, rateMultiplier)
      : rt.base_rate_minor,
  }));
}
