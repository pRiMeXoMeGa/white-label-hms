import { z } from 'zod';
import type { FolioCategory, ServiceRequestDto, ServiceType } from '../../../shared/types';
import { nowIso, today, type AppContext } from '../../context';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { percentOf, sum } from '../../lib/money';
import { hotelLocalToUtc } from '../../lib/time';
import { postEntry } from '../billing/folio';
import type { ReservationRow } from '../reservations';
import { CANCELLED, WORKFLOWS, isFinalStage, nextTransitionAt, stageAt } from './workflows';

export interface ServiceRequestRow {
  id: number;
  reservation_id: number;
  service: ServiceType;
  status: string;
  stage: number;
  title: string;
  details: string;
  notes: string | null;
  total_minor: number;
  scheduled_at: string | null;
  scheduled_end_at: string | null;
  next_transition_at: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
}

export interface NewRequest {
  service: ServiceType;
  title: string;
  details?: Record<string, unknown>;
  notes?: string | null;
  items?: Array<{ catalogItemId: number | null; name: string; quantity: number; unitMinor: number }>;
  scheduledAt?: string | null;
  scheduledEndAt?: string | null;
  /** Folio lines to post now. Empty for free services. */
  charges?: Array<{ category: FolioCategory; description: string; quantity: number; unitMinor: number }>;
}

export function delayFor(ctx: AppContext, service: ServiceType): number {
  return ctx.config.autoAdvance.secondsByService[service];
}

function scheduledEndUtc(ctx: AppContext, row: Pick<ServiceRequestRow, 'scheduled_end_at'>): Date | null {
  return row.scheduled_end_at ? hotelLocalToUtc(row.scheduled_end_at, ctx.hotel.timezone) : null;
}

/** Inserts a request with its items, first status event and folio charges, atomically. */
export function insertRequest(ctx: AppContext, r: ReservationRow, req: NewRequest): ServiceRequestRow {
  return ctx.db.tx(() => {
    const now = ctx.clock.now();
    const items = req.items ?? [];
    const charges = req.charges ?? [];
    const total = sum(charges.map((c) => c.quantity * c.unitMinor));
    const first = stageAt(req.service, 0);
    const endUtc = req.scheduledEndAt ? hotelLocalToUtc(req.scheduledEndAt, ctx.hotel.timezone) : null;
    const next = nextTransitionAt(req.service, 0, now, delayFor(ctx, req.service), endUtc);

    const id = ctx.db.run(
      `INSERT INTO service_requests (reservation_id, service, status, stage, title, details, notes, total_minor,
         scheduled_at, scheduled_end_at, next_transition_at, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.id, req.service, first.status, req.title, JSON.stringify(req.details ?? {}), req.notes ?? null, total,
        req.scheduledAt ?? null, req.scheduledEndAt ?? null, next?.toISOString() ?? null, now.toISOString(), now.toISOString()],
    ).lastId;

    for (const it of items) {
      ctx.db.run(
        `INSERT INTO service_request_items (request_id, catalog_item_id, name, quantity, unit_minor, amount_minor)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, it.catalogItemId, it.name, it.quantity, it.unitMinor, it.quantity * it.unitMinor],
      );
    }
    ctx.db.run('INSERT INTO service_request_events (request_id, status, created_at) VALUES (?, ?, ?)', [
      id, first.status, now.toISOString(),
    ]);
    const serviceDate = today(ctx);
    for (const c of charges) {
      postEntry(ctx, {
        reservationId: r.id,
        kind: 'charge',
        category: c.category,
        description: c.description,
        quantity: c.quantity,
        unitMinor: c.unitMinor,
        serviceDate,
        sourceType: 'service_request',
        sourceId: id,
      });
    }
    return getRequestRow(ctx, id)!;
  });
}

export function getRequestRow(ctx: AppContext, id: number): ServiceRequestRow | undefined {
  return ctx.db.get<ServiceRequestRow>('SELECT * FROM service_requests WHERE id = ?', [id]);
}

// ---------- Catalogue-based services: dining, laundry, amenities, housekeeping ----------

const ItemLine = z.object({
  itemId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(20),
});

export const CatalogOrderSchema = z.object({
  items: z.array(ItemLine).min(1).max(30),
  notes: z.string().trim().max(300).optional(),
  express: z.boolean().optional(),
  pickupTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});
export type CatalogOrderInput = z.infer<typeof CatalogOrderSchema>;

interface CatalogRow {
  id: number;
  service: string;
  name: string;
  price_minor: number;
  active: number;
}

const TITLES: Record<'food' | 'laundry' | 'amenity' | 'housekeeping', string> = {
  food: 'In-room dining',
  laundry: 'Laundry',
  amenity: 'Amenities',
  housekeeping: 'Housekeeping',
};

export function createCatalogOrder(
  ctx: AppContext,
  r: ReservationRow,
  service: 'food' | 'laundry' | 'amenity' | 'housekeeping',
  input: CatalogOrderInput,
): ServiceRequestRow {
  const merged = new Map<number, number>();
  for (const l of input.items) merged.set(l.itemId, (merged.get(l.itemId) ?? 0) + l.quantity);

  const items = [...merged.entries()].map(([itemId, quantity]) => {
    const row = ctx.db.get<CatalogRow>('SELECT * FROM catalog_items WHERE id = ?', [itemId]);
    if (!row || row.service !== service || !row.active) throw badRequest(`Item ${itemId} is not available for ${service}`);
    return { catalogItemId: row.id, name: row.name, quantity, unitMinor: row.price_minor };
  });

  const category: FolioCategory = service === 'food' ? 'food' : service === 'laundry' ? 'laundry' : 'other';
  const charges = items
    .filter((i) => i.unitMinor > 0)
    .map((i) => ({ category, description: `${TITLES[service]}: ${i.name}`, quantity: i.quantity, unitMinor: i.unitMinor }));

  if (service === 'laundry' && input.express) {
    const base = sum(items.map((i) => i.quantity * i.unitMinor));
    const pct = ctx.hotel.laundry.expressSurchargePercent;
    const surcharge = percentOf(base, pct);
    if (surcharge > 0) charges.push({ category, description: `Laundry: express surcharge (${pct}%)`, quantity: 1, unitMinor: surcharge });
  }

  const count = sum(items.map((i) => i.quantity));
  const summary = items.length === 1 ? items[0]!.name : `${count} items`;
  const title = service === 'laundry' && input.express ? `Express laundry, ${summary}` : `${TITLES[service]}, ${summary}`;

  return insertRequest(ctx, r, {
    service,
    title,
    notes: input.notes,
    details: { express: Boolean(input.express), pickupTime: input.pickupTime ?? null },
    items,
    charges,
  });
}

// ---------- Maintenance ----------

export const MaintenanceSchema = z.object({
  category: z.string().min(1),
  description: z.string().trim().min(3).max(500),
  urgent: z.boolean().optional(),
});

export function reportIssue(ctx: AppContext, r: ReservationRow, input: z.infer<typeof MaintenanceSchema>) {
  if (!ctx.hotel.maintenanceCategories.includes(input.category)) throw badRequest('Unknown issue category');
  return insertRequest(ctx, r, {
    service: 'maintenance',
    title: `Maintenance, ${input.category.toLowerCase()}`,
    notes: input.description,
    details: { category: input.category, urgent: Boolean(input.urgent) },
  });
}

// ---------- Read model ----------

export function toRequestDto(ctx: AppContext, row: ServiceRequestRow): ServiceRequestDto {
  const wf = WORKFLOWS[row.service];
  const events = ctx.db.all<{ status: string; created_at: string }>(
    'SELECT status, created_at FROM service_request_events WHERE request_id = ? ORDER BY id',
    [row.id],
  );
  const at = new Map(events.map((e) => [e.status, e.created_at]));
  const items = ctx.db.all<{ name: string; quantity: number; unit_minor: number; amount_minor: number }>(
    'SELECT name, quantity, unit_minor, amount_minor FROM service_request_items WHERE request_id = ? ORDER BY id',
    [row.id],
  );
  const isCancelled = row.status === CANCELLED;
  const label = isCancelled ? 'Cancelled' : (wf.stages[row.stage]?.label ?? row.status);
  return {
    id: row.id,
    service: row.service,
    title: row.title,
    status: row.status,
    statusLabel: label,
    isFinal: isCancelled || isFinalStage(row.service, row.stage),
    isCancelled,
    canCancel: canCancel(ctx, row),
    steps: wf.stages.map((s) => ({ status: s.status, label: s.label, at: at.get(s.status) ?? null })),
    items: items.map((i) => ({ name: i.name, quantity: i.quantity, unitMinor: i.unit_minor, amountMinor: i.amount_minor })),
    totalMinor: row.total_minor,
    notes: row.notes,
    details: JSON.parse(row.details) as Record<string, unknown>,
    scheduledAt: row.scheduled_at,
    nextUpdateAt: row.next_transition_at,
    createdAt: row.created_at,
  };
}

export function listRequests(ctx: AppContext, r: ReservationRow): ServiceRequestDto[] {
  return ctx.db
    .all<ServiceRequestRow>('SELECT * FROM service_requests WHERE reservation_id = ? ORDER BY id DESC', [r.id])
    .map((row) => toRequestDto(ctx, row));
}

// ---------- Cancellation ----------

function leadMinutesFor(ctx: AppContext, service: ServiceType): number {
  if (service === 'spa') return ctx.hotel.spa.minLeadMinutes;
  if (service === 'transfer') return ctx.hotel.transfers.minLeadMinutes;
  return 0;
}

export function canCancel(ctx: AppContext, row: ServiceRequestRow): boolean {
  if (row.status === CANCELLED || isFinalStage(row.service, row.stage)) return false;
  if (row.service === 'spa' || row.service === 'transfer') {
    if (!row.scheduled_at) return false;
    const start = hotelLocalToUtc(row.scheduled_at, ctx.hotel.timezone).getTime();
    return start - ctx.clock.now().getTime() > leadMinutesFor(ctx, row.service) * 60_000;
  }
  return row.stage === 0; // once the kitchen or a colleague has started, ask reception instead
}

export function cancelRequest(ctx: AppContext, r: ReservationRow, id: number): ServiceRequestRow {
  const row = getRequestRow(ctx, id);
  if (!row || row.reservation_id !== r.id) throw notFound('Request not found');
  if (!canCancel(ctx, row)) throw conflict('not_cancellable', 'This request can no longer be cancelled in the app');
  return voidRequest(ctx, r, row, 'Cancelled');
}

/** Marks a request cancelled, frees spa slots and reverses its charges with adjustments. */
export function voidRequest(ctx: AppContext, r: ReservationRow, row: ServiceRequestRow, reason: string) {
  return ctx.db.tx(() => {
    const now = nowIso(ctx);
    ctx.db.run(
      `UPDATE service_requests SET status = ?, next_transition_at = NULL, cancelled_at = ?, updated_at = ? WHERE id = ?`,
      [CANCELLED, now, now, row.id],
    );
    ctx.db.run('INSERT INTO service_request_events (request_id, status, created_at) VALUES (?, ?, ?)', [row.id, CANCELLED, now]);
    ctx.db.run('DELETE FROM spa_slot_locks WHERE request_id = ?', [row.id]);
    const charges = ctx.db.all<{ category: string; description: string; quantity: number; unit_minor: number; amount_minor: number }>(
      "SELECT category, description, quantity, unit_minor, amount_minor FROM folio_entries WHERE source_type = 'service_request' AND source_id = ? AND kind = 'charge'",
      [row.id],
    );
    for (const c of charges) {
      postEntry(ctx, {
        reservationId: r.id,
        kind: 'adjustment',
        category: c.category as FolioCategory,
        description: `${reason}: ${c.description}`,
        quantity: -c.quantity,
        unitMinor: c.unit_minor,
        amountMinor: -c.amount_minor,
        serviceDate: today(ctx),
        sourceType: 'service_request_void',
        sourceId: row.id,
      });
    }
    return getRequestRow(ctx, row.id)!;
  });
}

// ---------- Auto-progress ("option B") ----------

/**
 * Moves every due request one stage forward. Runs on a timer (see scheduler.ts) and is a
 * pure function of the clock and the database, which makes it easy to test.
 */
export function advanceDueRequests(ctx: AppContext): number {
  const now = ctx.clock.now();
  const due = ctx.db.all<ServiceRequestRow>(
    `SELECT sr.* FROM service_requests sr
     JOIN reservations r ON r.id = sr.reservation_id
     WHERE sr.next_transition_at IS NOT NULL AND sr.next_transition_at <= ? AND sr.status <> ?
     ORDER BY sr.next_transition_at LIMIT 500`,
    [now.toISOString(), CANCELLED],
  );
  for (const row of due) {
    ctx.db.tx(() => {
      const stage = row.stage + 1;
      const s = stageAt(row.service, stage);
      const next = nextTransitionAt(row.service, stage, now, delayFor(ctx, row.service), scheduledEndUtc(ctx, row));
      const res = ctx.db.run(
        `UPDATE service_requests SET stage = ?, status = ?, next_transition_at = ?, updated_at = ?
         WHERE id = ? AND stage = ?`,
        [stage, s.status, next?.toISOString() ?? null, now.toISOString(), row.id, row.stage],
      );
      if (res.changes === 1) {
        ctx.db.run('INSERT INTO service_request_events (request_id, status, created_at) VALUES (?, ?, ?)', [
          row.id, s.status, now.toISOString(),
        ]);
        if (row.service === 'spa' && isFinalStage('spa', stage)) {
          ctx.db.run('DELETE FROM spa_slot_locks WHERE request_id = ?', [row.id]);
        }
      }
    });
  }
  return due.length;
}

/** Rooms left dirty at check-out become clean after the configured turnaround. */
export function finishHousekeepingTurnarounds(ctx: AppContext): number {
  const cutoff = new Date(ctx.clock.now().getTime() - ctx.config.housekeepingTurnaroundSeconds * 1000).toISOString();
  return ctx.db.run(
    "UPDATE rooms SET housekeeping_status = 'clean', dirty_since = NULL WHERE housekeeping_status = 'dirty' AND dirty_since <= ?",
    [cutoff],
  ).changes;
}
