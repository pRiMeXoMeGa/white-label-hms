# 6. API specification

**Base URL:** `https://white-label-hms.onrender.com/api` (or `http://localhost:3000/api`)
This is the API I built for the web client.

**Format:** JSON request and response bodies (`Content-Type: application/json`), UTF-8. Money is in **minor units** (fils): `65000` = AED 650.00.
**Types:** every response type is defined in [`src/shared/types.ts`](../src/shared/types.ts); request validation is the Zod schema next to each module function.

## 6.1 Conventions

### Authentication

There are no accounts. Two credentials exist:

| Credential | Used for | Where it goes |
| --- | --- | --- |
| Booking reference + last name | Look up, cancel, check in | `:code` in the path + `lastName` in query or body |
| Stay ID | Everything under `/stays/:stayId` | Path segment |

Failed lookups (404 on `/reservations/:code`, `/check-in`, `/stays/...`) are counted per client IP; above `RATE_LIMIT_PER_MINUTE` (default 30) per minute, these endpoints answer `429` until the window resets. [Security](08-security-privacy.md) explains the model.

### Errors

```json
{ "error": { "code": "sold_out", "message": "Deluxe King is no longer available for these dates", "details": {} } }
```

| HTTP | `code` | When |
| --- | --- | --- |
| 400 | `bad_request` | Validation failed; `details.fields` lists `{ path, message }` for each problem |
| 400 | `invalid_json` | Body is not valid JSON |
| 404 | `not_found` | Unknown booking, stay, request, room type or endpoint |
| 405 | `method_not_allowed` | Known path, wrong method |
| 409 | `sold_out`, `slot_taken`, `not_cancellable`, `not_checkinable`, `stay_closed`, `feedback_exists`, `not_checked_out` | Request conflicts with current state |
| 413 | `payload_too_large` | Body over 64 KB |
| 415 | `unsupported_media_type` | Body sent without `application/json` |
| 422 | `party_too_large`, `too_early`, `too_late` | Valid input that breaks a business rule |
| 429 | `rate_limited` | Too many requests or failed lookups; `Retry-After` header in seconds |
| 500 | `internal_error` | Unexpected; details are logged, not returned |

## 6.2 Endpoint summary

| Method | Path | Purpose | Success |
| --- | --- | --- | --- |
| GET | `/health` | Liveness | 200 |
| GET | `/hotel` | Brand, policies, room types | 200 `PublicHotel` |
| GET | `/availability` | Rooms left and prices for dates | 200 `AvailabilityResult` |
| POST | `/reservations` | Book | 201 `ReservationDto` |
| GET | `/reservations/:code?lastName=` | Look up a booking | 200 `ReservationDto` |
| POST | `/reservations/:code/cancel` | Cancel before check-in | 200 `ReservationDto` |
| POST | `/check-in` | Online check-in | 200 `StayDto` |
| GET | `/stays/:stayId` | Stay summary and balance | 200 `StayDto` |
| GET | `/stays/:stayId/info` | Wi-Fi, hours, rules, local guide | 200 `StayInfo` |
| GET | `/stays/:stayId/catalog/:service` | Menu or list (`food`, `laundry`, `amenity`, `housekeeping`) | 200 `CatalogItemDto[]` |
| GET | `/stays/:stayId/options` | Spa treatments, transfer options, maintenance categories, laundry surcharge | 200 |
| GET | `/stays/:stayId/requests` | All requests, newest first | 200 `ServiceRequestDto[]` |
| POST | `/stays/:stayId/orders/:service` | Order dining/laundry or request amenity/housekeeping | 201 `ServiceRequestDto` |
| POST | `/stays/:stayId/maintenance` | Report an issue | 201 `ServiceRequestDto` |
| GET | `/stays/:stayId/spa/slots?date=&treatmentId=` | Start times for a day | 200 `SpaSlotDto[]` |
| POST | `/stays/:stayId/spa` | Book a treatment | 201 `ServiceRequestDto` |
| POST | `/stays/:stayId/transfers` | Book an airport transfer | 201 `ServiceRequestDto` |
| POST | `/stays/:stayId/requests/:id/cancel` | Cancel a request | 200 `ServiceRequestDto` |
| GET | `/stays/:stayId/bill` | Live (or frozen) bill | 200 `BillDto` |
| POST | `/stays/:stayId/checkout` | Pay and check out | 200 `InvoiceDto` |
| GET | `/stays/:stayId/invoice` | Invoice after check-out | 200 `InvoiceDto` |
| GET | `/stays/:stayId/invoice.pdf` | Invoice as PDF (download) | 200 `application/pdf` |
| POST | `/stays/:stayId/feedback` | Rating after check-out | 201 `{ "ok": true }` |

Endpoints under `/stays/:stayId` that **change** something (orders, bookings, cancel, check-out) or reveal in-stay information (`info`, `catalog`, `options`, `spa/slots`) need a stay that is currently checked in; otherwise `409 stay_closed`. Read-only `GET /stays/:stayId`, `/requests`, `/bill` and `/invoice` keep working after check-out.

## 6.3 Public endpoints

### `GET /availability`

| Query | Type | Rules |
| --- | --- | --- |
| `checkIn`, `checkOut` | `YYYY-MM-DD` | check-in ≥ today (hotel time zone), check-out > check-in, ≤ 30 nights, ≤ 365 days ahead |
| `adults` | int | 1–6, default 2 |
| `children` | int | 0–6, default 0 |

```json
{
  "checkIn": "2026-11-19", "checkOut": "2026-11-21", "nights": 2,
  "options": [{
    "roomType": { "id": 1, "slug": "deluxe-king", "name": "Deluxe King", "baseRateMinor": 65000, "maxAdults": 2, "maxChildren": 1, "...": "..." },
    "available": 6,
    "nightly": [ { "date": "2026-11-19", "rateMinor": 78000 }, { "date": "2026-11-20", "rateMinor": 78000 } ],
    "totalMinor": 156000,
    "fitsParty": true
  }]
}
```

### `POST /reservations`

```json
{
  "roomTypeSlug": "deluxe-king",
  "checkIn": "2026-11-19", "checkOut": "2026-11-21",
  "adults": 2, "children": 0,
  "guest": { "firstName": "Aisha", "lastName": "Khan", "email": "aisha@example.com", "phone": "+971501234567", "specialRequests": "High floor" },
  "card": { "holder": "Aisha Khan", "number": "4242 4242 4242 4242", "expiry": "12/29" }
}
```

| Field | Rules |
| --- | --- |
| names | 1–60 characters |
| email | valid email, ≤ 120 |
| phone | 6–30 characters |
| specialRequests | optional, ≤ 500 |
| card.number | 12–19 digits, Luhn-valid; only brand + last 4 are stored |
| card.expiry | `MM/YY` |

`201` response (`ReservationDto`):

```json
{
  "code": "SB-QRGBUU", "status": "confirmed",
  "roomType": { "name": "Deluxe King", "slug": "deluxe-king" }, "roomNumber": null,
  "checkIn": "2026-11-19", "checkOut": "2026-11-21", "nights": 2, "adults": 2, "children": 0,
  "guest": { "firstName": "Test", "lastName": "Guest", "email": "test.guest@example.com", "phone": "+971500000000" },
  "roomTotalMinor": 156000, "cardLast4": "4242", "canCheckInFrom": "2026-11-19", "stayCode": null,
  "createdAt": "2026-11-19T02:39:58.120Z"
}
```

Errors: `400` (validation), `404` (unknown room type), `409 sold_out`, `422 party_too_large`.

### `GET /reservations/:code?lastName=Khan` and `POST /reservations/:code/cancel`

Cancel body: `{ "lastName": "Khan" }`. Returns the updated `ReservationDto` (`status: "cancelled"`). `roomNumber` and `stayCode` are only filled once checked in. Errors: `404`, `409 not_cancellable` (already checked in, out or cancelled).

### `POST /check-in`

```json
{
  "code": "SB-QRGBUU", "lastName": "guest",
  "nationality": "India", "idType": "passport", "idNumber": "Z1234567",
  "arrivalTime": "15:00", "acceptTerms": true
}
```

`idType` is `passport`, `emirates_id` or `national_id`. Response `StayDto`:

```json
{
  "stayCode": "TP7A-TZ4P-64TQ", "status": "checked_in", "reservationCode": "SB-QRGBUU",
  "guestName": "Test Guest", "roomNumber": "101", "roomType": "Deluxe King", "floor": 1,
  "checkIn": "2026-11-19", "checkOut": "2026-11-21", "nights": 2,
  "balanceMinor": 194646, "invoiceNumber": null, "feedbackGiven": false, "cardOnFile": "Visa ending 4242"
}
```

Errors: `404`, `409 not_checkinable` (cancelled or checked out), `422 too_early` (before the window), `422 too_late` (stay ended). Calling again for a checked-in booking returns the same stay.

## 6.4 In-stay endpoints

### `POST /stays/:stayId/orders/:service`

`service` = `food`, `laundry`, `amenity` or `housekeeping`.

```json
{ "items": [ { "itemId": 3, "quantity": 2 }, { "itemId": 13, "quantity": 1 } ], "notes": "No chilli", "express": false, "pickupTime": "10:00" }
```

| Field | Rules |
| --- | --- |
| items | 1–30 lines; `quantity` 1–20; items must belong to that service and be active; duplicate lines are merged |
| notes | optional, ≤ 300 |
| express, pickupTime | laundry only; express adds the configured surcharge (50%) |

`201` response (`ServiceRequestDto`):

```json
{
  "id": 1, "service": "food", "title": "In-room dining, 3 items",
  "status": "received", "statusLabel": "Order received", "isFinal": false, "isCancelled": false, "canCancel": true,
  "steps": [
    { "status": "received", "label": "Order received", "at": "2026-11-19T02:41:12.004Z" },
    { "status": "preparing", "label": "Kitchen is preparing", "at": null },
    { "status": "on_the_way", "label": "On the way to your room", "at": null },
    { "status": "delivered", "label": "Delivered", "at": null }
  ],
  "items": [ { "name": "Shakshuka", "quantity": 2, "unitMinor": 4800, "amountMinor": 9600 } ],
  "totalMinor": 11400, "notes": null, "details": { "express": false, "pickupTime": null },
  "scheduledAt": null, "nextUpdateAt": "2026-11-19T02:42:12.004Z", "createdAt": "2026-11-19T02:41:12.004Z"
}
```

### `POST /stays/:stayId/maintenance`

`{ "category": "Air conditioning", "description": "Blowing warm air", "urgent": true }`: `category` must be one of `GET /options` → `maintenanceCategories`; description 3–500 characters.

### Spa

`GET /stays/:stayId/spa/slots?date=2026-11-20&treatmentId=1`

```json
[ { "start": "2026-11-20T10:00", "end": "2026-11-20T11:00", "available": true },
  { "start": "2026-11-20T10:30", "end": "2026-11-20T11:30", "available": false } ]
```

`date` must be within the stay and not in the past. Times are hotel-local.

`POST /stays/:stayId/spa`: `{ "treatmentId": 1, "start": "2026-11-20T10:00", "notes": "Light pressure" }`. Errors: `400` (outside opening hours or stay), `409 slot_taken`.

### `POST /stays/:stayId/transfers`

```json
{ "direction": "to_airport", "airport": "DXB", "vehicle": "sedan", "pickupAt": "2026-11-21T10:00", "flightNumber": "EK 203", "passengers": 2, "notes": "2 large bags" }
```

| Field | Rules |
| --- | --- |
| direction | `to_airport` or `from_airport` |
| airport, vehicle | codes from `GET /options` (`DXB`, `DWC`; `sedan`, `suv`, `luxury`) |
| pickupAt | hotel-local `YYYY-MM-DDTHH:mm`, ≥ now + 2 h, not after the check-out day |
| flightNumber | like `EK 203` |
| passengers | 1–12 and ≤ the car's seats |

### `POST /stays/:stayId/requests/:id/cancel`

No body. Allowed while the request is in its first status; spa until 60 min and transfers until 120 min before the start. Reverses any charge with a negative bill line. Errors: `404`, `409 not_cancellable`.

### `GET /stays/:stayId/bill`

```json
{
  "currency": "AED",
  "lines": [ { "date": "2026-11-19", "category": "room", "description": "Room night, Deluxe King", "quantity": 1, "unitMinor": 78000, "amountMinor": 78000 } ],
  "byCategory": [ { "category": "room", "amountMinor": 156000 }, { "category": "food", "amountMinor": 11400 } ],
  "subtotalMinor": 236400,
  "taxes": [
    { "kind": "percent", "code": "SC", "name": "Service charge", "ratePercent": 10, "basisMinor": 236400, "amountMinor": 23640 },
    { "kind": "percent", "code": "MF", "name": "Municipality fee", "ratePercent": 7, "basisMinor": 167400, "amountMinor": 11718 },
    { "kind": "per_room_night", "code": "TD", "name": "Tourism Dirham", "unitMinor": 1500, "roomNights": 2, "amountMinor": 3000 },
    { "kind": "percent", "code": "VAT", "name": "VAT", "ratePercent": 5, "basisMinor": 271758, "amountMinor": 13588 }
  ],
  "taxTotalMinor": 51946, "totalMinor": 288346, "paidMinor": 0, "balanceMinor": 288346,
  "isFinal": false, "notes": [ "Room charges cover every booked night. ..." ]
}
```

### `POST /stays/:stayId/checkout`

`{ "method": "card_on_file" }` or `{ "method": "new_card", "holder": "…", "number": "…", "expiry": "MM/YY" }`.

Response `InvoiceDto`: `number`, `issuedAt`, `reservationCode`, `guestName`, `roomNumber`, `checkIn`, `checkOut` (actual billed departure), `bill` (final `BillDto`, `isFinal: true`, `balanceMinor: 0`), `payment` (`method` e.g. "Visa ending 4242", `reference`). Errors: `409 stay_closed` if already checked out.

### `GET /stays/:stayId/invoice.pdf`

`Content-Type: application/pdf`, `Content-Disposition: attachment; filename="SB-INV-2026-00001.pdf"`. `404` before check-out.

### `POST /stays/:stayId/feedback`

`{ "rating": 5, "comment": "Lovely stay" }`: rating 1–5, comment ≤ 1000. `409 not_checked_out` before check-out, `409 feedback_exists` on a second attempt.

## 6.5 Example: whole journey with curl

```bash
API=https://white-label-hms.onrender.com/api
TODAY=$(curl -s $API/health | jq -r .today)
OUT=$(date -d "$TODAY +2 day" +%F)

CODE=$(curl -s -X POST $API/reservations -H 'content-type: application/json' -d "{
  \"roomTypeSlug\":\"deluxe-king\",\"checkIn\":\"$TODAY\",\"checkOut\":\"$OUT\",\"adults\":2,
  \"guest\":{\"firstName\":\"Aisha\",\"lastName\":\"Khan\",\"email\":\"a@example.com\",\"phone\":\"+971500000000\"},
  \"card\":{\"holder\":\"Aisha Khan\",\"number\":\"4242424242424242\",\"expiry\":\"12/29\"}}" | jq -r .code)

STAY=$(curl -s -X POST $API/check-in -H 'content-type: application/json' -d "{
  \"code\":\"$CODE\",\"lastName\":\"Khan\",\"nationality\":\"India\",\"idType\":\"passport\",
  \"idNumber\":\"Z1234567\",\"acceptTerms\":true}" | jq -r .stayCode)

curl -s -X POST $API/stays/$STAY/orders/food -H 'content-type: application/json' -d '{"items":[{"itemId":3,"quantity":2}]}'
curl -s $API/stays/$STAY/bill | jq '.totalMinor'
curl -s -X POST $API/stays/$STAY/checkout -H 'content-type: application/json' -d '{"method":"card_on_file"}' | jq .number
curl -s -o invoice.pdf $API/stays/$STAY/invoice.pdf
```
