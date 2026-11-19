import type { BillDto, BillLine, FolioCategory, InvoiceDto } from '../../../shared/types';
import { nowIso, type AppContext } from '../../context';
import { sum } from '../../lib/money';
import type { ReservationRow } from '../reservations';
import { computeTaxes } from './tax';

export interface FolioEntryInput {
  reservationId: number;
  kind: 'charge' | 'adjustment' | 'tax' | 'payment';
  category: FolioCategory | 'tax' | 'payment';
  description: string;
  quantity?: number;
  unitMinor: number;
  amountMinor?: number;
  serviceDate: string;
  sourceType?: string;
  sourceId?: number;
}

interface FolioRow {
  id: number;
  kind: FolioEntryInput['kind'];
  category: string;
  description: string;
  quantity: number;
  unit_minor: number;
  amount_minor: number;
  service_date: string;
  source_type: string | null;
}

export function postEntry(ctx: AppContext, e: FolioEntryInput): number {
  const quantity = e.quantity ?? 1;
  const amount = e.amountMinor ?? quantity * e.unitMinor;
  return ctx.db.run(
    `INSERT INTO folio_entries (reservation_id, kind, category, description, quantity, unit_minor, amount_minor,
       service_date, source_type, source_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [e.reservationId, e.kind, e.category, e.description, quantity, e.unitMinor, amount, e.serviceDate,
      e.sourceType ?? null, e.sourceId ?? null, nowIso(ctx)],
  ).lastId;
}

/** Room-nights still charged on the folio (night charges minus released nights). */
export function chargedRoomNights(ctx: AppContext, reservationId: number): number {
  const row = ctx.db.get<{ n: number | null }>(
    "SELECT SUM(quantity) AS n FROM folio_entries WHERE reservation_id = ? AND source_type = 'room_night'",
    [reservationId],
  );
  return row?.n ?? 0;
}

/** The guest's running bill: posted charges and adjustments, taxes computed live. */
export function computeLiveBill(ctx: AppContext, r: ReservationRow): BillDto {
  const rows = ctx.db.all<FolioRow>(
    'SELECT * FROM folio_entries WHERE reservation_id = ? ORDER BY service_date, id',
    [r.id],
  );
  const chargeRows = rows.filter((x) => x.kind === 'charge' || x.kind === 'adjustment');
  const lines: BillLine[] = chargeRows.map((x) => ({
    date: x.service_date,
    category: x.category as FolioCategory,
    description: x.description,
    quantity: x.quantity,
    unitMinor: x.unit_minor,
    amountMinor: x.amount_minor,
  }));

  const categories = new Map<FolioCategory, number>();
  for (const l of lines) categories.set(l.category, (categories.get(l.category) ?? 0) + l.amountMinor);
  const byCategory = [...categories.entries()]
    .map(([category, amountMinor]) => ({ category, amountMinor }))
    .filter((c) => c.amountMinor !== 0);

  const subtotalMinor = sum(lines.map((l) => l.amountMinor));
  const taxes = computeTaxes(ctx.hotel.taxes, lines, chargedRoomNights(ctx, r.id));
  const taxTotalMinor = sum(taxes.map((t) => t.amountMinor));
  const totalMinor = subtotalMinor + taxTotalMinor;
  const paidMinor = -sum(rows.filter((x) => x.kind === 'payment').map((x) => x.amount_minor));

  return {
    currency: ctx.hotel.currency,
    lines,
    byCategory,
    subtotalMinor,
    taxes,
    taxTotalMinor,
    totalMinor,
    paidMinor,
    balanceMinor: totalMinor - paidMinor,
    isFinal: false,
    notes: [
      'Room charges cover every booked night. If you leave early, unused nights are released automatically at check-out.',
    ],
  };
}

/** After check-out the bill is frozen: it is read from the issued invoice, not recomputed. */
export function getBill(ctx: AppContext, r: ReservationRow): BillDto {
  if (r.status === 'checked_out') {
    const inv = ctx.db.get<{ payload: string }>('SELECT payload FROM invoices WHERE reservation_id = ?', [r.id]);
    if (inv) return (JSON.parse(inv.payload) as InvoiceDto).bill;
  }
  return computeLiveBill(ctx, r);
}
