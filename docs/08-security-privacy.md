# 8. Security and privacy

**Related:** [LLD 2.7](02-low-level-design.md#27-http-layer-validation-errors-limits), [Decision ADR-03](11-decision-records.md#adr-03-no-login-booking-reference-and-stay-id)

This is a demo, but I built it the way I build a production guest app. This document lists what protects what, and what I still plan to add before production.

## 8.1 Assets and threats

| Asset | Threat | Main controls |
| --- | --- | --- |
| A guest's booking (name, email, phone, dates) | Someone looks it up or cancels it | Needs reference **and** last name; failed lookups rate-limited |
| A guest's stay (room number, orders, bill, Wi-Fi) | Someone guesses a Stay ID and orders on the guest's bill | ~59-bit random Stay ID; failed lookups rate-limited; Stay ID only works while checked in for changes |
| Card data | Theft of card numbers | Full numbers are never stored (brand + last 4 only); no CVC sent to the server |
| ID document data | Theft of passport or Emirates ID numbers | Only the last 4 characters are stored |
| Inventory and bills | Double selling, tampered amounts | Database constraints, append-only ledger, server-side prices and taxes |
| The service | Abuse, oversized requests, malformed addresses, crashes | Request budget per Stay ID or client address, bounded limiter memory, 64 KB body cap, Zod validation, `400` for malformed percent-encoding, generic 500s from a wrapped request handler |
| The browser session | XSS, clickjacking, data leaks via referrer, downgrade to HTTP | React escaping, strict CSP, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, HSTS in production |
| Logs | Guest keys copied from logs | Booking references and Stay IDs in paths are logged as `:code` |

## 8.2 Identity without accounts

```mermaid
flowchart LR
  A["Booking reference<br/>SB-7K3QXA"] --- B["+ last name"]
  B -->|"lookup, cancel, check-in"| C[Booking]
  C -->|"check-in issues"| D["Stay ID<br/>XXXX-XXXX-XXXX"]
  D -->|"bearer key, valid while checked in"| E[In-stay app]
```

| Credential | Strength | Limits |
| --- | --- | --- |
| Booking reference + last name | 31⁶ ≈ 887 million references × the name must match | Two factors the guest already has; same model airlines use for "manage booking" |
| Stay ID | 31¹² ≈ 7.9 × 10¹⁷ (~59 bits) from `crypto.randomInt` | At 30 failed guesses per minute per IP, guessing one active Stay ID among 100 is far beyond practical |

**Brute-force protection:** a lookup of a booking reference or Stay ID that does not exist (`404` on `/reservations/:code`, `/check-in` or `/stays/...`) counts as a failed lookup for the client address. Other errors, such as a wrong date, do not count. After `RATE_LIMIT_PER_MINUTE` (30) failures in a minute, those endpoints return `429` with `Retry-After` for that address until the window ends. A code that resolved successfully in the last 24 hours keeps working, so a guest is not locked out by someone else on the same network.

**Client address:** on Render a request passes Cloudflare and then Render's own proxy, and each appends to `X-Forwarded-For`, so the header ends with `client, cloudflare`. I take the entry `TRUST_PROXY_HOPS` from the right: 2 when Render's `RENDER=true` variable is present, 1 elsewhere (one proxy in front). That is the address Cloudflare saw; entries a client writes into the header itself sit further left and are ignored.

**General budget:** 10 × `RATE_LIMIT_PER_MINUTE` calls a minute, at least 300, counted per Stay ID for `/stays/...` (so guests sharing hotel Wi-Fi do not share one budget) and per client address for everything else. The limiter holds at most 50 000 keys and drops expired and then the oldest windows first, so made-up keys cannot grow memory without limit.

**Least privilege by state:** changing anything or reading Wi-Fi details requires a stay that is **currently checked in**. After check-out the Stay ID only reads the bill, invoice and requests.

## 8.3 Personal data

| Data | Collected | Stored | Shown back |
| --- | --- | --- | --- |
| Name, email, phone | Booking | Yes | To whoever has reference + last name |
| Special requests | Booking (optional) | Yes | Not exposed by the API after booking |
| Card number | Booking / check-out | **No**, brand + last 4 only | "Visa ending 4242" |
| Card expiry, CVC | Booking | **No** (CVC never leaves the browser) | — |
| Nationality, ID type | Check-in | Yes | No |
| ID number | Check-in | **Last 4 characters only** | No |
| Arrival time | Check-in (optional) | Yes | No |
| Feedback | After check-out | Yes | No |

**Privacy notes (UAE PDPL / GDPR-style principles)**
- *Data minimisation:* only what a hotel needs to register a guest; card and ID numbers are truncated on arrival.
- *Purpose limitation:* data is used only to run the stay; there is no marketing or tracking, no third-party scripts, no cookies (local storage only keeps the Stay ID on the guest's own device).
- *Retention:* the demo database is cleared on every deploy. For production I plan a retention job that anonymises guest details a set number of months after check-out and keeps invoices for the legally required period.
- *Rights:* for production I plan export and erasure of guest details, while keeping tax records.

Guest registration rules (for example, UAE hotels reporting guests to the authorities) need the full document and are handled at the front desk in this design; the app explains that the original document is checked when the key is collected.

## 8.4 Payments

- The MVP **does not take money**. Cards are format-checked (Luhn, `MM/YY` not in the past) and then reduced to brand + last 4.
- My production design: card fields served by the payment provider (hosted fields or a payment page), the server receives a token, and charges use 3-D Secure. This keeps the app in the lightest PCI DSS scope (SAQ A), because card numbers never touch the app's servers.

## 8.5 Application security controls

| Control | Implementation |
| --- | --- |
| Input validation | Zod schema on every body and query; lengths, enums, formats, ranges; JSON numbers only in bodies; strict `HH:mm`; blank strings treated as absent |
| Server-side truth | Prices, taxes, availability and totals are always computed on the server from the database and config, never taken from the client |
| SQL injection | Every query uses bound parameters (`?`); no SQL is built from input |
| XSS | React escapes output; no `dangerouslySetInnerHTML`; brand values injected into `index.html` are HTML-escaped (including `'`) and colours are validated as `#rrggbb` |
| CSP | `default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` |
| Other headers | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` |
| Transport | HTTPS terminated by Render; `Strict-Transport-Security: max-age=15552000; includeSubDomains` in production |
| Request limits | `Content-Type: application/json` only, 64 KB max, `415`/`413` otherwise |
| Path traversal | Static paths are decoded safely, normalised and must stay inside the client directory |
| Source exposure | No source maps in the production client; `.map` files are never served |
| Error handling | Known errors return a code and message; unknown errors return a generic 500 and are logged with the stack server-side; the whole request callback is wrapped, so one bad request cannot stop the process |
| Concurrency | Write transactions (`BEGIN IMMEDIATE`) and compare-and-set updates prevent race conditions on rooms, spa slots, status changes and check-out |
| Container | Runs as non-root `node` user; only `/data` is writable; no build tools or dev dependencies at runtime; docs and CI files stay out of the build context |
| Secrets | None are needed in the MVP; production secrets (payment keys) will live in the host's secret store, never in the repo |

## 8.6 Known gaps before production

| Gap | Risk | My planned fix |
| --- | --- | --- |
| No staff authentication (no staff UI yet) | — | SSO/OIDC with roles when the staff console is added |
| Stay ID in the URL | Visible in browser history and in screenshots | Exchange it for an HttpOnly session cookie after first open; rotate on check-out |
| In-memory rate limiter | Resets on restart; per instance | Shared store (Redis) at the edge or in the app |
| Booking needs no payment | Rooms can be held with a test card and never paid for; the last-name lookup also exposes the guest's contact details | Real card authorisation at booking, and contact details masked in lookups |
| Stay ID recovery by reference + last name | Anyone with both can open the stay | A one-time code sent to the guest's email or phone |
| Guests on one network share a failed-lookup counter | Typing mistakes by one guest count for all on the hotel Wi-Fi | Per-device counters once sessions exist |
| No audit log for guest-side actions beyond request events | Harder investigations | Central audit log with actor, IP, action |
| No CSRF token | Low: JSON-only API, no cookies, same-origin CSP | Required once cookies are used |
| Dependency scanning | Vulnerable packages | Dependabot or `npm audit` in CI |
| `style-src 'unsafe-inline'` | Small CSP relaxation for React inline styles and the injected theme | Nonce-based styles |
