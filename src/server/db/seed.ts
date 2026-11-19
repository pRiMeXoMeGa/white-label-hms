import type { HotelConfig } from '../config/hotel';
import type { Db } from './database';

/** Loads rooms and the service catalogue from the hotel config into an empty database. */
export function seedIfEmpty(db: Db, hotel: HotelConfig): boolean {
  const existing = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM room_types');
  if (existing && existing.n > 0) return false;

  db.tx(() => {
    hotel.roomTypes.forEach((rt, i) => {
      const { lastId } = db.run(
        `INSERT INTO room_types (slug, name, description, base_rate_minor, max_adults, max_children, size_sqm, bed, view, amenities, sort)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [rt.slug, rt.name, rt.description, rt.baseRateMinor, rt.maxAdults, rt.maxChildren, rt.sizeSqm, rt.bed, rt.view, JSON.stringify(rt.amenities), i],
      );
      for (const number of rt.rooms) {
        const floor = Number.parseInt(number.slice(0, -2) || '0', 10);
        db.run('INSERT INTO rooms (number, floor, room_type_id) VALUES (?, ?, ?)', [number, floor, lastId]);
      }
    });

    const catalog: Array<[service: string, items: HotelConfig['dining']]> = [
      ['food', hotel.dining],
      ['laundry', hotel.laundry.items],
      ['amenity', hotel.amenities],
      ['housekeeping', hotel.housekeeping],
    ];
    for (const [service, items] of catalog) {
      items.forEach((item, i) => {
        db.run(
          `INSERT INTO catalog_items (service, code, category, name, description, price_minor, tags, sort)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [service, item.code, item.category, item.name, item.description, item.priceMinor, JSON.stringify(item.tags), i],
        );
      });
    }

    hotel.spa.treatments.forEach((t, i) => {
      db.run(
        'INSERT INTO spa_treatments (code, name, description, duration_min, price_minor, sort) VALUES (?, ?, ?, ?, ?, ?)',
        [t.code, t.name, t.description, t.durationMin, t.priceMinor, i],
      );
    });
  });
  return true;
}
