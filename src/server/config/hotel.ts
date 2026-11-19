import { readFileSync } from 'node:fs';
import { z } from 'zod';

// The hotel config file is the white-label surface: brand, policies, taxes and the
// catalogue a property sells. Swap the file (HOTEL_CONFIG_PATH) to re-brand the app.

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected a #rrggbb colour');
const money = z.number().int().nonnegative();
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:mm');

const TaxRule = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('percent'),
    code: z.string(),
    name: z.string(),
    ratePercent: z.number().positive().max(100).refine((v) => Number.isInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 1e-9, 'at most 2 decimal places'),
    appliesTo: z.array(z.enum(['room', 'food', 'laundry', 'spa', 'transfer', 'other'])).min(1),
    // Codes of earlier taxes whose amounts are also part of this tax's basis (e.g. VAT on service charge).
    compoundOn: z.array(z.string()).default([]),
  }),
  z.object({
    type: z.literal('per_room_night'),
    code: z.string(),
    name: z.string(),
    amountMinor: money,
  }),
]);
export type TaxRuleConfig = z.infer<typeof TaxRule>;

const CatalogItem = z.object({
  code: z.string(),
  category: z.string(),
  name: z.string(),
  description: z.string().default(''),
  priceMinor: money.default(0),
  tags: z.array(z.string()).default([]),
});

export const HotelConfigSchema = z.object({
  brand: z.object({
    name: z.string(),
    shortName: z.string(),
    codePrefix: z.string().regex(/^[A-Z]{2,4}$/),
    tagline: z.string(),
    colors: z.object({ primary: hex, primaryInk: hex, accent: hex, surface: hex, ink: hex }),
  }),
  contact: z.object({
    address: z.string(),
    phone: z.string(),
    email: z.string().email(),
    whatsapp: z.string().optional(),
  }),
  currency: z.string().length(3),
  locale: z.string(),
  timezone: z.string(),
  checkInTime: hhmm,
  checkOutTime: hhmm,
  maxNights: z.number().int().positive().default(30),
  bookingWindowDays: z.number().int().positive().default(365),
  weekend: z.object({ nights: z.array(z.number().int().min(0).max(6)), rateMultiplier: z.number().min(1) }),
  highlights: z.array(z.string()),
  taxes: z.array(TaxRule),
  taxesNote: z.string(),
  wifi: z.object({ network: z.string(), password: z.string(), note: z.string().optional() }),
  hours: z.array(z.object({ name: z.string(), place: z.string(), hours: z.string() })),
  houseRules: z.array(z.string()),
  localGuide: z.array(
    z.object({
      name: z.string(),
      category: z.string(),
      distanceKm: z.number().nonnegative(),
      description: z.string(),
      tip: z.string().optional(),
    }),
  ),
  roomTypes: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      description: z.string(),
      baseRateMinor: money,
      maxAdults: z.number().int().positive(),
      maxChildren: z.number().int().nonnegative(),
      sizeSqm: z.number().int().positive(),
      bed: z.string(),
      view: z.string(),
      amenities: z.array(z.string()),
      rooms: z.array(z.string()).min(1),
    }),
  ),
  dining: z.array(CatalogItem),
  laundry: z.object({ expressSurchargePercent: z.number().min(0).max(100).refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9, 'at most 2 decimal places'), items: z.array(CatalogItem) }),
  amenities: z.array(CatalogItem),
  housekeeping: z.array(CatalogItem),
  maintenanceCategories: z.array(z.string()).min(1),
  spa: z.object({
    opensAt: hhmm,
    closesAt: hhmm,
    slotMinutes: z.number().int().positive(),
    treatmentRooms: z.number().int().positive(),
    minLeadMinutes: z.number().int().nonnegative(),
    treatments: z.array(
      z.object({
        code: z.string(),
        name: z.string(),
        description: z.string(),
        durationMin: z.number().int().positive(),
        priceMinor: money,
      }),
    ),
  }),
  transfers: z.object({
    minLeadMinutes: z.number().int().nonnegative(),
    airports: z.array(z.object({ code: z.string(), name: z.string(), durationMin: z.number().int().positive() })),
    vehicles: z.array(
      z.object({
        code: z.string(),
        name: z.string(),
        seats: z.number().int().positive(),
        bags: z.number().int().nonnegative(),
        priceMinor: money,
      }),
    ),
  }),
});

export type HotelConfig = z.infer<typeof HotelConfigSchema>;

export function loadHotelConfig(path: string): HotelConfig {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const parsed = HotelConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid hotel config at ${path}:\n${issues}`);
  }
  const cfg = parsed.data;
  const spaSlotsOk = cfg.spa.treatments.every((t) => t.durationMin % cfg.spa.slotMinutes === 0);
  if (!spaSlotsOk) throw new Error('Every spa treatment duration must be a multiple of spa.slotMinutes');
  return cfg;
}
