// Types shared by the API server and the web client. Money is always an integer in
// minor units (fils for AED) to avoid floating-point rounding errors.

export const SERVICE_TYPES = ['food', 'laundry', 'housekeeping', 'amenity', 'maintenance', 'spa', 'transfer'] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export type ReservationStatus = 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';
export type FolioCategory = 'room' | 'food' | 'laundry' | 'spa' | 'transfer' | 'other';

export interface Brand {
  name: string;
  shortName: string;
  tagline: string;
  colors: { primary: string; primaryInk: string; accent: string; surface: string; ink: string };
}

export interface OpeningHours {
  name: string;
  place: string;
  hours: string;
}

export interface GuideItem {
  name: string;
  category: string;
  distanceKm: number;
  description: string;
  tip?: string;
}

export interface PublicHotel {
  brand: Brand;
  contact: { address: string; phone: string; email: string; whatsapp?: string };
  currency: string;
  locale: string;
  timezone: string;
  today: string;
  checkInTime: string;
  checkOutTime: string;
  highlights: string[];
  taxesNote: string;
  roomTypes: RoomTypeDto[];
}

export interface RoomTypeDto {
  id: number;
  slug: string;
  name: string;
  description: string;
  baseRateMinor: number;
  maxAdults: number;
  maxChildren: number;
  sizeSqm: number;
  bed: string;
  view: string;
  amenities: string[];
}

export interface NightPrice {
  date: string;
  rateMinor: number;
}

export interface AvailabilityResult {
  checkIn: string;
  checkOut: string;
  nights: number;
  options: Array<{
    roomType: RoomTypeDto;
    available: number;
    nightly: NightPrice[];
    totalMinor: number;
    fitsParty: boolean;
  }>;
}

export interface ReservationDto {
  code: string;
  status: ReservationStatus;
  roomType: { name: string; slug: string };
  roomNumber: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  guest: { firstName: string; lastName: string; email: string; phone: string };
  roomTotalMinor: number;
  cardLast4: string | null;
  canCheckInFrom: string;
  /** Present once checked in, so a guest who lost their Stay ID can recover it. */
  stayCode: string | null;
  createdAt: string;
}

export interface StayDto {
  stayCode: string;
  status: ReservationStatus;
  reservationCode: string;
  guestName: string;
  roomNumber: string;
  roomType: string;
  floor: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  balanceMinor: number;
  invoiceNumber: string | null;
  feedbackGiven: boolean;
  /** e.g. "Visa ending 4242": the card that guaranteed the booking. */
  cardOnFile: string | null;
  /** Checked in and past check-out time on the check-out date: new requests are closed. */
  overdue: boolean;
}

export interface StayInfo {
  wifi: { network: string; password: string; note?: string };
  hours: OpeningHours[];
  houseRules: string[];
  localGuide: GuideItem[];
  contact: PublicHotel['contact'];
}

export interface CatalogItemDto {
  id: number;
  service: 'food' | 'laundry' | 'amenity' | 'housekeeping';
  category: string;
  name: string;
  description: string;
  priceMinor: number;
  tags: string[];
}

export interface StatusStep {
  status: string;
  label: string;
  at: string | null;
}

export interface ServiceRequestDto {
  id: number;
  service: ServiceType;
  title: string;
  status: string;
  statusLabel: string;
  isFinal: boolean;
  isCancelled: boolean;
  canCancel: boolean;
  steps: StatusStep[];
  items: Array<{ name: string; quantity: number; unitMinor: number; amountMinor: number }>;
  totalMinor: number;
  notes: string | null;
  details: Record<string, unknown>;
  scheduledAt: string | null;
  nextUpdateAt: string | null;
  createdAt: string;
}

export interface SpaTreatmentDto {
  id: number;
  name: string;
  description: string;
  durationMin: number;
  priceMinor: number;
}

export interface SpaSlotDto {
  start: string; // hotel local time, YYYY-MM-DDTHH:mm
  end: string;
  available: boolean;
}

export interface TransferVehicleDto {
  code: string;
  name: string;
  seats: number;
  bags: number;
  priceMinor: number;
}

export interface TransferOptions {
  airports: Array<{ code: string; name: string; durationMin: number }>;
  vehicles: TransferVehicleDto[];
}

export interface BillLine {
  date: string;
  category: FolioCategory;
  description: string;
  quantity: number;
  unitMinor: number;
  amountMinor: number;
}

export type TaxLine =
  | { kind: 'percent'; code: string; name: string; ratePercent: number; basisMinor: number; amountMinor: number }
  | { kind: 'per_room_night'; code: string; name: string; unitMinor: number; roomNights: number; amountMinor: number };

export interface BillDto {
  currency: string;
  lines: BillLine[];
  byCategory: Array<{ category: FolioCategory; amountMinor: number }>;
  subtotalMinor: number;
  taxes: TaxLine[];
  taxTotalMinor: number;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
  isFinal: boolean;
  notes: string[];
}

/** What check-out would do right now, worked out without changing anything. */
export interface CheckoutPreviewDto {
  bill: BillDto;
  /** The date the stay ends on the invoice (earlier than booked for an early departure). */
  checkOut: string;
  /** The amount the payment card is charged at check-out. */
  dueMinor: number;
  nightsReleased: number;
  /** Titles of spa treatments and transfers that check-out releases and refunds. */
  servicesReleased: string[];
}

export interface InvoiceDto {
  number: string;
  issuedAt: string;
  reservationCode: string;
  guestName: string;
  roomNumber: string;
  checkIn: string;
  checkOut: string;
  bill: BillDto;
  payment: { method: string; reference: string };
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
