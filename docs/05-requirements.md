# 5. Requirements

**Related:** [User guide](14-user-guide.md), [Limitations and future scope](13-limitations-future-scope.md)

## 5.1 Product context

The long-term product is a **white-label hotel management system (HMS)**: one cloud platform that hotel groups and resellers can rebrand. The full vision has 16 modules: property setup, reservations, front desk, housekeeping, maintenance, billing, night audit, rates and revenue, channel manager, booking engine, guest CRM, POS, sales and events, reports, platform administration, and integrations.

This repository is my **MVP**, which I built in two days to show the end-to-end guest experience for **one hotel**, with no login, plus the technical foundations (data integrity, billing, white-label config) that the full product needs.

## 5.2 MVP scope

| In scope | Out of scope (details in [section 13](13-limitations-future-scope.md)) |
| --- | --- |
| Public site: rooms, availability, booking, manage/cancel booking | Staff, front-desk, housekeeping and admin consoles |
| Online check-in with ID details, Stay ID | Multiple properties and tenants |
| In-stay app: dining, laundry, housekeeping, amenities, maintenance, spa, airport transfer, hotel info | Real payment gateway |
| Live request status (auto-progress by timer) | Email, SMS, WhatsApp notifications |
| Live itemised bill with configurable taxes | Channel manager / OTA sync, rate plans, revenue management |
| Express check-out, PDF invoice, feedback | POS, loyalty, sales and events |
| White-label config file; deploy to a public URL | Arabic / right-to-left UI |

## 5.3 Users

| User | Goal | Device |
| --- | --- | --- |
| Prospective guest | Find a room for their dates and book it quickly | Phone or laptop |
| In-house guest | Get things done without calling reception | Phone, in the room |
| Departing guest | Leave without queueing; get a proper invoice | Phone |
| Hotel operator | Rebrand, change prices and timers without code changes | Config file, hosting dashboard |
| Reviewer (hiring manager) | Try the whole journey in 5 minutes | Laptop |

## 5.4 User stories and acceptance criteria

I wrote these stories before building and used the acceptance criteria as my test cases.

### Booking

**US-01 Search availability**: As a guest, I want to see which rooms are free for my dates and what they cost.
- Given valid dates (check-in today or later, check-out after check-in, ≤ 30 nights, within 365 days), the system lists every room type with rooms left, nightly prices and the total before taxes.
- Thursday and Friday nights cost 20% more (configurable).
- Room types too small for the party or sold out are shown but cannot be selected.
- Invalid dates return a clear message (e.g. "Check-in date cannot be in the past").

**US-02 Book a room**: As a guest, I want to book a room with my details and a card guarantee.
- Required: first and last name, email, phone (6–30 characters), card holder, card number (Luhn-valid), expiry `MM/YY` that is not in the past, acceptance of terms.
- The confirm button shows the room total and says it is before taxes.
- A sold-out room type, or one too small for the party, cannot be booked even from a direct link.
- On success the guest sees a booking reference like `SB-7K3QXA`, the stay summary and the room total.
- If the last room was taken in the meantime, the guest gets "no longer available" and nothing is booked.
- No two bookings can ever hold the same room on the same night.
- Only the card brand and last 4 digits are stored.

**US-03 Manage or cancel**: As a guest, I want to look up my booking and cancel it if plans change.
- Lookup needs the booking reference **and** last name (case-insensitive); a wrong pair says the booking was not found.
- A booking can be cancelled online until check-in; the room goes back on sale immediately.
- A guest who lost their Stay ID can recover it here, during the stay and after check-out.

### Check-in

**US-04 Online check-in**: As a guest, I want to check in from my phone and know my room number.
- Opens on the arrival date (or `EARLY_CHECKIN_DAYS` before) and closes at check-out date.
- Requires nationality, document type (passport, Emirates ID, national ID), document number, acceptance of house rules; arrival time optional, as a 24-hour `HH:mm` time.
- On success: room number, floor, room type and a Stay ID such as `UX7E-MCVN-TKAP`; the Stay ID is remembered on the device.
- Repeating check-in with the same details returns the same stay.
- Only the last 4 characters of the document number are stored.

### In-stay services

**US-05 In-room dining**: Browse the menu by section, add items to a cart (up to 20 of each item), add notes, place the order. The order shows live status (received, preparing, on the way, delivered) and is added to the bill.

**US-06 Laundry**: Choose items and quantities, regular or express (+50%), and a pickup time; only times still ahead today are offered, and after the last one the times are for tomorrow. Status: received, picked up from the room, washing and pressing, returned to the room.

**US-07 Housekeeping and amenities**: Request cleaning, towels, turndown, toiletries, extra pillow, baby cot, adapters and similar. Free of charge.

**US-08 Report an issue**: Pick a category (air conditioning, plumbing or water, electrical or lights, TV or Wi-Fi, door or lock, other), describe it, optionally mark urgent. Status: reported, technician assigned, being fixed, resolved.

**US-09 Spa booking**: Choose a treatment, a day during the stay and a free start time.
- Slots run every 30 minutes within opening hours (10:00–22:00) and must end by closing; on the check-out day they must end by check-out time (12:00).
- Slots less than 60 minutes ahead are unavailable.
- At most 3 treatments overlap (3 treatment rooms); a taken slot cannot be booked.
- Status: requested, confirmed, completed (after the slot ends). Cancellable until 60 minutes before, after a second confirmation.

**US-10 Airport transfer**: Choose direction (hotel to airport or airport to hotel), airport (DXB, DWC), day and time, flight number, passengers, car type (sedan, SUV, luxury).
- At least 2 hours' notice; passengers must fit the car (the book button stays disabled until they do).
- Hotel to airport: any time up to the end of the check-out day. Airport to hotel: on a day before the check-out day.
- Cancellable until 2 hours before pickup, after a second confirmation.
- Fixed price per car added to the bill. Status: requested, confirmed, driver assigned, completed.

**US-11 Hotel info**: Checked-in guests see the Wi-Fi network and password (with a copy button), opening hours, house rules, a local guide with distances, and reception contacts.

**US-12 Request status**: Every request shows its current status, a progress bar and when it was requested, and keeps updating on its own, including on the confirmation shown right after ordering. Spa and transfer bookings appear under Upcoming until their booked time. A request can be cancelled until staff start on it (spa up to 60 minutes before, transfers up to 2 hours before), and its charge is reversed on the bill.

### Billing and check-out

**US-13 Live bill**: The guest sees every charge (room nights, orders, bookings), the subtotal, each tax with its rate and basis, and the balance, updated as orders are placed.

**US-14 Express check-out**: As a departing guest, I want to pay and leave.
- Pay with the card used to book (shown as e.g. "Visa ending 4242") or another card.
- The amount on the pay button is exactly what is charged; it is worked out by the server before the guest pays.
- Leaving early: unused nights from today onwards are released and removed from the bill (at least one night is charged), and the booking is shortened to the nights charged; spa bookings not yet started and transfers booked for a later day are cancelled and refunded. The page lists what is released before the guest pays.
- After check-out time on the last day, new orders and bookings are closed and the app says so; check-out stays open.
- Afterwards: "Thank you" page, total paid, invoice number, **PDF tax invoice** download, and the stay becomes read-only.

**US-15 Feedback**: After check-out, rate the stay 1–5 with an optional comment, once.

### Operator

**US-16 Re-brand without code**: Changing `config/hotel.json` changes the name, colours, contact details, policies, taxes, room types, menus, prices, spa and transfer options. Invalid config stops the app at start-up with a clear message.

**US-17 Control simulated staff speed**: `AUTO_ADVANCE_SECONDS` (default 10 s) and per-service variables set how long each status lasts.

## 5.5 Business rules (summary)

| Rule | Value in the demo hotel | Configurable in |
| --- | --- | --- |
| Check-in / check-out time | 15:00 / 12:00 | `hotel.json` |
| Max stay, booking window | 30 nights, 365 days | `hotel.json` |
| Weekend uplift | Thu, Fri nights × 1.2 | `hotel.json` |
| Taxes | Service charge 10%; municipality fee 7% on room and food; Tourism Dirham AED 15 per room night; VAT 5% on everything incl. service charge and municipality fee | `hotel.json` |
| Laundry express | +50% | `hotel.json` |
| Spa | 10:00–22:00, 30-min slots, 3 rooms, 60 min notice | `hotel.json` |
| Transfers | 2 h notice; sedan AED 180, SUV AED 260, luxury AED 450 | `hotel.json` |
| Online check-in window | arrival day | `EARLY_CHECKIN_DAYS` |
| Status timers | 10 s per status (scheduler checks every 2 s) | `AUTO_ADVANCE_SECONDS*`, `AUTO_ADVANCE_TICK_SECONDS` |

## 5.6 Non-functional requirements

| Area | Requirement (MVP) |
| --- | --- |
| Correctness | No double booking, no over-booked spa slot, bill entries never altered (all enforced in the database) |
| Responsiveness | API p95 under 200 ms for a single hotel; in-stay status visible within 6 s of becoming due (2 s scheduler + 4 s polling) |
| Usability | Mobile-first in-stay app; whole journey usable on a 390 px wide phone; keyboard accessible, visible focus |
| Security | Unguessable Stay ID; brute-force limits; no full card or ID numbers stored; strict security headers |
| Portability | One Docker image; runs on any Docker host; Node 22.13+ |
| Testability | Automated unit/integration tests and a browser journey in CI |
| Rebranding | No code change needed for a different property |
