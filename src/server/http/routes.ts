import { z } from 'zod';
import type { CatalogItemDto, PublicHotel } from '../../shared/types';
import { today, type AppContext } from '../context';
import { HttpError, badRequest } from '../lib/errors';
import { searchAvailability } from '../modules/availability';
import { renderInvoicePdf } from '../modules/billing/invoice-pdf';
import { getBill } from '../modules/billing/folio';
import { CheckoutSchema, checkout, getInvoice } from '../modules/checkout';
import {
  CreateReservationSchema,
  cancelReservation,
  createReservation,
  findReservation,
  toReservationDto,
} from '../modules/reservations';
import {
  CatalogOrderSchema,
  MaintenanceSchema,
  cancelRequest,
  createCatalogOrder,
  listRequests,
  reportIssue,
  toRequestDto,
} from '../modules/requests/requests';
import { listRoomTypes, toRoomTypeDto } from '../modules/rooms';
import {
  SpaBookingSchema,
  TransferSchema,
  bookSpa,
  bookTransfer,
  listTreatments,
  spaSlots,
  transferOptions,
} from '../modules/scheduled-services';
import { CheckInSchema, FeedbackSchema, checkIn, getActiveStay, getStay, leaveFeedback, stayInfo, toStayDto } from '../modules/stays';
import { Router, created, parse } from './router';

const CATALOG_SERVICES = ['food', 'laundry', 'amenity', 'housekeeping'] as const;
const CatalogService = z.enum(CATALOG_SERVICES);

export function buildRouter(ctx: AppContext): Router {
  const r = new Router();
  const h = ctx.hotel;

  r.get('/api/health', () => ({ ok: true, today: today(ctx) }));

  // ---------- Public site ----------
  r.get('/api/hotel', (): PublicHotel => ({
    brand: { name: h.brand.name, shortName: h.brand.shortName, tagline: h.brand.tagline, colors: h.brand.colors },
    contact: h.contact,
    currency: h.currency,
    locale: h.locale,
    timezone: h.timezone,
    today: today(ctx),
    checkInTime: h.checkInTime,
    checkOutTime: h.checkOutTime,
    highlights: h.highlights,
    taxesNote: h.taxesNote,
    roomTypes: listRoomTypes(ctx).map(toRoomTypeDto),
  }));

  r.get('/api/availability', ({ query }) => {
    const q = parse(
      z.object({
        checkIn: z.string(),
        checkOut: z.string(),
        adults: z.coerce.number().int().min(1).max(6).default(2),
        children: z.coerce.number().int().min(0).max(6).default(0),
      }),
      Object.fromEntries(query),
    );
    return searchAvailability(ctx, q);
  });

  r.post('/api/reservations', ({ body }) => {
    const reservation = createReservation(ctx, parse(CreateReservationSchema, body));
    return created(toReservationDto(ctx, reservation));
  });

  const Lookup = z.object({ lastName: z.string().trim().min(1) });

  r.get('/api/reservations/:code', ({ params, query }) => {
    const { lastName } = parse(Lookup, Object.fromEntries(query));
    return toReservationDto(ctx, findReservation(ctx, params.code!, lastName));
  });

  r.post('/api/reservations/:code/cancel', ({ params, body }) => {
    const { lastName } = parse(Lookup, body);
    return toReservationDto(ctx, cancelReservation(ctx, params.code!, lastName));
  });

  r.post('/api/check-in', ({ body }) => {
    const stay = checkIn(ctx, parse(CheckInSchema, body));
    return toStayDto(ctx, stay);
  });

  // ---------- In-stay app (the Stay ID is the guest's key) ----------
  r.get('/api/stays/:code', ({ params }) => toStayDto(ctx, getStay(ctx, params.code!)));

  r.get('/api/stays/:code/info', ({ params }) => {
    getActiveStay(ctx, params.code!);
    return stayInfo(ctx);
  });

  r.get('/api/stays/:code/catalog/:service', ({ params }): CatalogItemDto[] => {
    getActiveStay(ctx, params.code!);
    const service = parse(CatalogService, params.service);
    return ctx.db
      .all<{ id: number; service: CatalogItemDto['service']; category: string; name: string; description: string; price_minor: number; tags: string }>(
        'SELECT * FROM catalog_items WHERE service = ? AND active = 1 ORDER BY sort, id',
        [service],
      )
      .map((i) => ({
        id: i.id,
        service: i.service,
        category: i.category,
        name: i.name,
        description: i.description,
        priceMinor: i.price_minor,
        tags: JSON.parse(i.tags) as string[],
      }));
  });

  r.get('/api/stays/:code/options', ({ params }) => {
    getActiveStay(ctx, params.code!);
    return {
      laundryExpressSurchargePercent: h.laundry.expressSurchargePercent,
      maintenanceCategories: h.maintenanceCategories,
      spa: { opensAt: h.spa.opensAt, closesAt: h.spa.closesAt, minLeadMinutes: h.spa.minLeadMinutes, treatments: listTreatments(ctx) },
      transfers: { minLeadMinutes: h.transfers.minLeadMinutes, ...transferOptions(ctx) },
    };
  });

  r.get('/api/stays/:code/requests', ({ params }) => listRequests(ctx, getStay(ctx, params.code!)));

  r.post('/api/stays/:code/orders/:service', ({ params, body }) => {
    const stay = getActiveStay(ctx, params.code!);
    const service = parse(CatalogService, params.service);
    return created(toRequestDto(ctx, createCatalogOrder(ctx, stay, service, parse(CatalogOrderSchema, body))));
  });

  r.post('/api/stays/:code/maintenance', ({ params, body }) => {
    const stay = getActiveStay(ctx, params.code!);
    return created(toRequestDto(ctx, reportIssue(ctx, stay, parse(MaintenanceSchema, body))));
  });

  r.get('/api/stays/:code/spa/slots', ({ params, query }) => {
    const stay = getActiveStay(ctx, params.code!);
    const q = parse(z.object({ date: z.string(), treatmentId: z.coerce.number().int().positive() }), Object.fromEntries(query));
    return spaSlots(ctx, stay, q.date, q.treatmentId);
  });

  r.post('/api/stays/:code/spa', ({ params, body }) => {
    const stay = getActiveStay(ctx, params.code!);
    return created(toRequestDto(ctx, bookSpa(ctx, stay, parse(SpaBookingSchema, body))));
  });

  r.post('/api/stays/:code/transfers', ({ params, body }) => {
    const stay = getActiveStay(ctx, params.code!);
    return created(toRequestDto(ctx, bookTransfer(ctx, stay, parse(TransferSchema, body))));
  });

  r.post('/api/stays/:code/requests/:id/cancel', ({ params }) => {
    const stay = getActiveStay(ctx, params.code!);
    const id = Number(params.id);
    if (!Number.isInteger(id)) throw badRequest('Invalid request id');
    return toRequestDto(ctx, cancelRequest(ctx, stay, id));
  });

  r.get('/api/stays/:code/bill', ({ params }) => getBill(ctx, getStay(ctx, params.code!)));

  r.post('/api/stays/:code/checkout', ({ params, body }) => checkout(ctx, params.code!, parse(CheckoutSchema, body)));

  r.get('/api/stays/:code/invoice', ({ params }) => getInvoice(ctx, params.code!).invoice);

  r.get('/api/stays/:code/invoice.pdf', async ({ params }) => {
    const { invoice } = getInvoice(ctx, params.code!);
    return {
      kind: 'binary' as const,
      contentType: 'application/pdf',
      body: await renderInvoicePdf(ctx.hotel, invoice),
      filename: `${invoice.number}.pdf`,
    };
  });

  r.post('/api/stays/:code/feedback', ({ params, body }) => {
    const stay = getStay(ctx, params.code!);
    if (stay.status !== 'checked_out') throw new HttpError(409, 'not_checked_out', 'Feedback opens after check-out');
    leaveFeedback(ctx, params.code!, parse(FeedbackSchema, body));
    return created({ ok: true });
  });

  return r;
}
