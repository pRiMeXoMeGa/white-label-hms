import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { InvoiceDto, TaxLine } from '../../../shared/types';
import type { HotelConfig } from '../../config/hotel';

// Standard PDF fonts only cover WinAnsi, so keep every string printable ASCII.
const ascii = (s: string) => s.replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, ' ');

export function formatMoneyAscii(minor: number, currency: string): string {
  const sign = minor < 0 ? '-' : '';
  const value = (Math.abs(minor) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}${currency} ${value}`;
}

function hexToRgb(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function taxLabel(t: TaxLine, currency: string) {
  return t.kind === 'percent'
    ? `${t.name} ${t.ratePercent}% on ${formatMoneyAscii(t.basisMinor, currency)}`
    : `${t.name}, ${formatMoneyAscii(t.unitMinor, currency)} x ${t.roomNights} room night(s)`;
}

export async function renderInvoicePdf(hotel: HotelConfig, inv: InvoiceDto): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${inv.number}`);
  pdf.setAuthor(hotel.brand.name);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const primary = hexToRgb(hotel.brand.colors.primary);
  const muted = rgb(0.38, 0.4, 0.4);
  const cur = inv.bill.currency;

  const W = 595.28;
  const H = 841.89;
  const M = 48;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const text = (s: string, x: number, size = 10, font: PDFFont = regular, color = rgb(0.1, 0.12, 0.12)) =>
    page.drawText(ascii(s), { x, y, size, font, color });
  const right = (s: string, xRight: number, size = 10, font: PDFFont = regular) =>
    page.drawText(ascii(s), { x: xRight - font.widthOfTextAtSize(ascii(s), size), y, size, font });
  const ensure = (space: number) => {
    if (y - space < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };

  // Header band
  page.drawRectangle({ x: 0, y: H - 110, width: W, height: 110, color: primary });
  y = H - 52;
  text(hotel.brand.name, M, 20, bold, rgb(1, 1, 1));
  y -= 18;
  text(hotel.contact.address, M, 9, regular, rgb(0.9, 0.93, 0.93));
  y -= 12;
  text(`${hotel.contact.phone}  |  ${hotel.contact.email}`, M, 9, regular, rgb(0.9, 0.93, 0.93));
  y = H - 52;
  page.drawText('TAX INVOICE', { x: W - M - bold.widthOfTextAtSize('TAX INVOICE', 14), y, size: 14, font: bold, color: rgb(1, 1, 1) });

  y = H - 145;
  const meta: Array<[string, string]> = [
    ['Invoice number', inv.number],
    ['Issued', inv.issuedAt.slice(0, 10)],
    ['Booking reference', inv.reservationCode],
    ['Guest', inv.guestName],
    ['Room', inv.roomNumber],
    ['Stay', `${inv.checkIn} to ${inv.checkOut}`],
  ];
  for (const [k, v] of meta) {
    text(k, M, 9, regular, muted);
    text(v, M + 120, 10, bold);
    y -= 16;
  }

  // Line items
  y -= 14;
  const cols = { date: M, desc: M + 72, qty: W - M - 110, amount: W - M };
  page.drawLine({ start: { x: M, y: y + 12 }, end: { x: W - M, y: y + 12 }, thickness: 0.5, color: muted });
  text('Date', cols.date, 9, bold);
  text('Description', cols.desc, 9, bold);
  right('Qty', cols.qty, 9, bold);
  right('Amount', cols.amount, 9, bold);
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: muted });
  y -= 14;

  for (const line of inv.bill.lines) {
    ensure(16);
    const desc = line.description.length > 58 ? `${line.description.slice(0, 57)}...` : line.description;
    text(line.date, cols.date, 9);
    text(desc, cols.desc, 9);
    right(String(line.quantity), cols.qty, 9);
    right(formatMoneyAscii(line.amountMinor, cur), cols.amount, 9);
    y -= 15;
  }

  // Totals
  ensure(40 + inv.bill.taxes.length * 15);
  y -= 4;
  page.drawLine({ start: { x: W / 2 - 80, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.5, color: muted });
  y -= 8;
  const totalRow = (label: string, minor: number, strong = false) => {
    ensure(16);
    page.drawText(ascii(label), { x: W / 2 - 80, y, size: strong ? 11 : 9, font: strong ? bold : regular });
    right(formatMoneyAscii(minor, cur), cols.amount, strong ? 11 : 9, strong ? bold : regular);
    y -= strong ? 18 : 15;
  };
  totalRow('Subtotal', inv.bill.subtotalMinor);
  for (const t of inv.bill.taxes) totalRow(taxLabel(t, cur), t.amountMinor);
  totalRow('Total', inv.bill.totalMinor, true);
  totalRow(`Paid, ${inv.payment.method}`, -inv.bill.paidMinor);
  totalRow('Balance due', inv.bill.balanceMinor, true);

  y -= 20;
  ensure(40);
  for (const note of [...inv.bill.notes, 'Thank you for staying with us. This invoice was generated electronically.']) {
    text(note, M, 8, regular, muted);
    y -= 12;
  }
  return pdf.save();
}
