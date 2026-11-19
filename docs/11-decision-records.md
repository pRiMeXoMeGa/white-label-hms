# 11. Architecture decision records (ADRs)

These are the key decisions I made for the MVP. Each record states the context, my decision, the alternatives I considered and the consequences. Status for all: **Accepted** (19 November 2026).

| # | Decision |
| --- | --- |
| [ADR-01](#adr-01-sqlite-for-the-mvp-postgres-later) | SQLite for the MVP, Postgres later |
| [ADR-02](#adr-02-one-deployable) | One deployable for UI, API and scheduler |
| [ADR-03](#adr-03-no-login-booking-reference-and-stay-id) | No login: booking reference + last name, then a Stay ID |
| [ADR-04](#adr-04-polling-instead-of-push) | Polling instead of push updates |
| [ADR-05](#adr-05-append-only-folio-and-frozen-invoice) | Append-only folio and frozen invoice |
| [ADR-06](#adr-06-timer-driven-auto-progress-instead-of-a-staff-console) | Timer-driven auto-progress instead of a staff console |
| [ADR-07](#adr-07-minimal-frontend-dependencies) | Minimal frontend dependencies |
| [ADR-08](#adr-08-white-label-through-one-validated-config-file) | White-label through one validated config file |
| [ADR-09](#adr-09-assign-a-specific-room-at-booking-time) | Assign a specific room at booking time |
| [ADR-10](#adr-10-money-as-integer-minor-units) | Money as integer minor units |

---

## ADR-01: SQLite for the MVP, Postgres later

**Context.** Two days to build and deploy; a free host; one hotel. The data model still needs real constraints and transactions (no double booking, append-only bills).

**Decision.** I use SQLite through Node's built-in `node:sqlite`, in WAL mode, with constraints and triggers doing the integrity work.

**Alternatives.** Hosted Postgres (extra service, connection setup, free tiers expire); an ORM over Postgres (more setup, less visible SQL); in-memory data (no constraints, not a real backend).

**Consequences.**
- No database server to provision; one file; tests use the same engine in memory.
- Single writer and single instance; data is lost on the free host when it restarts.
- I isolated database access behind a small `Db` wrapper, so moving to Postgres changes one layer. My Postgres design is in [Database 3.8](03-database-design.md#38-path-to-postgresql-and-multi-tenancy).

## ADR-02: One deployable

**Context.** A reviewer needs one link. Separate frontend and backend deployments mean CORS, two URLs and two builds.

**Decision.** I run one Node process that serves the built React app and the JSON API and runs the scheduler, in one Docker image.

**Alternatives.** Static site + API service; Next.js; serverless functions (they do not suit a long-running scheduler).

**Consequences.** Simple deploy and same-origin requests (strict CSP possible). Scaling the API means scaling the scheduler with it; I plan to split the worker out when that matters ([Performance 9.4](09-performance-scalability.md#94-scaling-path)).

## ADR-03: No login: booking reference and Stay ID

**Context.** The brief asked for no login. Guests don't want to create an account for a hotel stay, but their bill must not be open to anyone.

**Decision.** I made booking actions need the booking reference **and** last name. Check-in issues a random Stay ID (~59 bits) that is the key to the in-stay app. Failed lookups are rate-limited per IP; Stay IDs can only change things while the stay is checked in.

**Alternatives.** Email magic links (needs email delivery); passwords (friction, password storage); QR room codes only (anyone in the room could use them).

**Consequences.** Zero friction and no password storage. The Stay ID is a bearer token in the URL; for production I plan to swap it for an HttpOnly cookie after first use ([Security 8.6](08-security-privacy.md#86-known-gaps-before-production)).

## ADR-04: Polling instead of push

**Context.** Statuses change every 10 seconds in the demo (configurable); the app must feel live.

**Decision.** The client polls: requests every 4 s, stay every 15 s, bill every 10 s, paused when the tab is hidden.

**Alternatives.** WebSockets or Server-Sent Events (connection management, proxy timeouts on the free host, more code).

**Consequences.** Simple and robust, with a little wasted traffic. Fine for one hotel; I plan to move to Server-Sent Events when traffic grows.

## ADR-05: Append-only folio and frozen invoice

**Context.** Bills must be explainable, and corrections (cancellations, early departure) must not erase history.

**Decision.** I record every money movement as a new `folio_entries` row; database triggers block updates and deletes. At check-out the full bill is stored as a JSON snapshot in `invoices`, and closed stays are read from it.

**Alternatives.** Mutable order totals; recomputing invoices on demand.

**Consequences.** Full audit trail; a tax-rate change never alters past invoices. The live bill is computed on each read, which is cheap at hotel scale.

## ADR-06: Timer-driven auto-progress instead of a staff console

**Context.** Two days were not enough for a staff UI, but requests must move through realistic statuses in a demo.

**Decision.** I modelled each service as a state machine; a scheduler checks every 2 seconds and moves due requests after `AUTO_ADVANCE_SECONDS` (10 s by default; per-service overrides in env). Spa and transfers complete when their booked time has passed.

**Alternatives.** A minimal staff page with a passcode; statuses computed on read from timestamps.

**Consequences.** A self-running demo with configurable speed. The same state machines and `service_request_events` table will back my staff console; staff actions will replace the timer for each transition.

## ADR-07: Minimal frontend dependencies

**Context.** Fast load on phones; a small codebase a reviewer can read.

**Decision.** I use React only, with a 60-line router, a small `useApi` hook and hand-written CSS with variables, bundled by esbuild.

**Alternatives.** React Router, TanStack Query, Tailwind, a component library.

**Consequences.** ~270 KB raw JS, no CSS framework, everything visible in the repo. More hand-written code for routing and data fetching; I plan to adopt libraries when the staff console adds many screens.

## ADR-08: White-label through one validated config file

**Context.** The product is white-label; the MVP is one hotel.

**Decision.** I put all property data (brand, colours, policies, taxes, rooms, menus, spa, transfers, Wi-Fi, guide) in `config/hotel.json`, validated with Zod at start-up. The server injects colours into the page; illustrations are drawn from those colours.

**Alternatives.** Hard-coded demo content; a database-backed admin from day one.

**Consequences.** A new hotel is a new JSON file and an env var. For the multi-tenant version I plan to move this config into the database per tenant, with an admin UI.

## ADR-09: Assign a specific room at booking time

**Context.** Hotels often sell room types and assign rooms later, but that needs a nightly allocation process.

**Decision.** I assign the room at booking and store one `room_nights` row per night, preferring clean rooms.

**Alternatives.** Type-level inventory counts with assignment at check-in.

**Consequences.** Exact per-night inventory and a database-level guarantee against double booking. Room moves and upgrades become an update of those rows, which I plan to add with the staff console.

## ADR-10: Money as integer minor units

**Context.** Floating-point amounts produce rounding errors in bills and taxes.

**Decision.** I store and compute all amounts in fils (integers) and round each tax once on its total, half away from zero. Percentages are computed in integers too, with the rate in hundredths of a percent, so a rate such as 4.35% never picks up a floating-point error. Invoice numbers come from a per-year counter row taken inside the check-out transaction.

**Consequences.** Totals always add up to the fil on screen, in the PDF and in the database. Formatting to `AED 1,234.56` happens only at the edges.
