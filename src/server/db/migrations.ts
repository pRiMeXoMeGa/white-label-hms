import type { Db } from './database';

// Forward-only, numbered migrations. Each runs once inside a transaction.
const MIGRATIONS: Array<{ version: number; name: string; sql: string }> = [
  {
    version: 1,
    name: 'initial schema',
    sql: `
CREATE TABLE room_types (
  id               INTEGER PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL,
  base_rate_minor  INTEGER NOT NULL CHECK (base_rate_minor >= 0),
  max_adults       INTEGER NOT NULL CHECK (max_adults >= 1),
  max_children     INTEGER NOT NULL CHECK (max_children >= 0),
  size_sqm         INTEGER NOT NULL,
  bed              TEXT NOT NULL,
  view             TEXT NOT NULL,
  amenities        TEXT NOT NULL DEFAULT '[]',
  sort             INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE rooms (
  id                   INTEGER PRIMARY KEY,
  number               TEXT NOT NULL UNIQUE,
  floor                INTEGER NOT NULL,
  room_type_id         INTEGER NOT NULL REFERENCES room_types(id),
  housekeeping_status  TEXT NOT NULL DEFAULT 'clean'
                       CHECK (housekeeping_status IN ('clean', 'dirty', 'out_of_order')),
  dirty_since          TEXT
);

CREATE TABLE reservations (
  id                INTEGER PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,
  stay_code         TEXT UNIQUE,
  room_type_id      INTEGER NOT NULL REFERENCES room_types(id),
  room_id           INTEGER NOT NULL REFERENCES rooms(id),
  check_in          TEXT NOT NULL,
  check_out         TEXT NOT NULL,
  adults            INTEGER NOT NULL CHECK (adults >= 1),
  children          INTEGER NOT NULL DEFAULT 0 CHECK (children >= 0),
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  email             TEXT NOT NULL,
  phone             TEXT NOT NULL,
  special_requests  TEXT,
  status            TEXT NOT NULL CHECK (status IN ('confirmed', 'checked_in', 'checked_out', 'cancelled')),
  room_total_minor  INTEGER NOT NULL,
  card_brand        TEXT,
  card_last4        TEXT,
  nationality       TEXT,
  id_type           TEXT,
  id_last4          TEXT,
  arrival_time      TEXT,
  created_at        TEXT NOT NULL,
  checked_in_at     TEXT,
  checked_out_at    TEXT,
  cancelled_at      TEXT,
  CHECK (check_out > check_in)
);
CREATE INDEX reservations_last_name ON reservations (lower(last_name));

-- One row per sold room-night. The primary key makes a double booking impossible at
-- the database level (the SQLite equivalent of a Postgres EXCLUDE constraint).
CREATE TABLE room_nights (
  room_id         INTEGER NOT NULL REFERENCES rooms(id),
  night           TEXT NOT NULL,
  reservation_id  INTEGER NOT NULL REFERENCES reservations(id),
  rate_minor      INTEGER NOT NULL,
  PRIMARY KEY (room_id, night)
);
CREATE INDEX room_nights_reservation ON room_nights (reservation_id);

-- Append-only guest ledger. Corrections are new rows (adjustments), never edits.
CREATE TABLE folio_entries (
  id              INTEGER PRIMARY KEY,
  reservation_id  INTEGER NOT NULL REFERENCES reservations(id),
  kind            TEXT NOT NULL CHECK (kind IN ('charge', 'adjustment', 'tax', 'payment')),
  category        TEXT NOT NULL,
  description     TEXT NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 1,
  unit_minor      INTEGER NOT NULL,
  amount_minor    INTEGER NOT NULL,
  service_date    TEXT NOT NULL,
  source_type     TEXT,
  source_id       INTEGER,
  created_at      TEXT NOT NULL
);
CREATE INDEX folio_entries_reservation ON folio_entries (reservation_id);
CREATE TRIGGER folio_entries_no_update BEFORE UPDATE ON folio_entries
BEGIN SELECT RAISE(ABORT, 'folio entries are append-only'); END;
CREATE TRIGGER folio_entries_no_delete BEFORE DELETE ON folio_entries
BEGIN SELECT RAISE(ABORT, 'folio entries are append-only'); END;

CREATE TABLE catalog_items (
  id           INTEGER PRIMARY KEY,
  service      TEXT NOT NULL CHECK (service IN ('food', 'laundry', 'amenity', 'housekeeping')),
  code         TEXT NOT NULL UNIQUE,
  category     TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  price_minor  INTEGER NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
  tags         TEXT NOT NULL DEFAULT '[]',
  active       INTEGER NOT NULL DEFAULT 1,
  sort         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE spa_treatments (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  duration_min  INTEGER NOT NULL,
  price_minor   INTEGER NOT NULL,
  sort          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE service_requests (
  id                  INTEGER PRIMARY KEY,
  reservation_id      INTEGER NOT NULL REFERENCES reservations(id),
  service             TEXT NOT NULL,
  status              TEXT NOT NULL,
  stage               INTEGER NOT NULL DEFAULT 0,
  title               TEXT NOT NULL,
  details             TEXT NOT NULL DEFAULT '{}',
  notes               TEXT,
  total_minor         INTEGER NOT NULL DEFAULT 0,
  scheduled_at        TEXT,   -- hotel-local wall-clock time (spa, transfer)
  scheduled_end_at    TEXT,
  next_transition_at  TEXT,   -- UTC; NULL when nothing is pending
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  cancelled_at        TEXT
);
CREATE INDEX service_requests_reservation ON service_requests (reservation_id);
CREATE INDEX service_requests_due ON service_requests (next_transition_at) WHERE next_transition_at IS NOT NULL;

CREATE TABLE service_request_items (
  id               INTEGER PRIMARY KEY,
  request_id       INTEGER NOT NULL REFERENCES service_requests(id),
  catalog_item_id  INTEGER REFERENCES catalog_items(id),
  name             TEXT NOT NULL,
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  unit_minor       INTEGER NOT NULL,
  amount_minor     INTEGER NOT NULL
);
CREATE INDEX service_request_items_request ON service_request_items (request_id);

CREATE TABLE service_request_events (
  id          INTEGER PRIMARY KEY,
  request_id  INTEGER NOT NULL REFERENCES service_requests(id),
  status      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX service_request_events_request ON service_request_events (request_id);

-- A spa booking holds one treatment room for each 30-minute slot it covers.
CREATE TABLE spa_slot_locks (
  resource    INTEGER NOT NULL,
  slot_start  TEXT NOT NULL,
  request_id  INTEGER NOT NULL REFERENCES service_requests(id),
  PRIMARY KEY (resource, slot_start)
);
CREATE INDEX spa_slot_locks_request ON spa_slot_locks (request_id);

CREATE TABLE invoices (
  id              INTEGER PRIMARY KEY,
  number          TEXT NOT NULL UNIQUE,
  reservation_id  INTEGER NOT NULL UNIQUE REFERENCES reservations(id),
  issued_at       TEXT NOT NULL,
  total_minor     INTEGER NOT NULL,
  payload         TEXT NOT NULL
);

CREATE TABLE feedback (
  reservation_id  INTEGER PRIMARY KEY REFERENCES reservations(id),
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TEXT NOT NULL
);
`,
  },
  {
    version: 2,
    name: 'invoice number sequence per year',
    sql: `
-- Invoice numbers restart at 00001 each year. The counter lives in its own row so the
-- number is taken inside the check-out transaction, never by counting invoices.
CREATE TABLE invoice_sequences (
  year  TEXT PRIMARY KEY,
  last  INTEGER NOT NULL CHECK (last >= 0)
);
INSERT INTO invoice_sequences (year, last)
  SELECT substr(number, -10, 4), MAX(CAST(substr(number, -5) AS INTEGER)) FROM invoices GROUP BY 1;
`,
  },
];

export function migrate(db: Db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`);
  const applied = new Set(db.all<{ version: number }>('SELECT version FROM schema_migrations').map((r) => r.version));
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.tx(() => {
      db.exec(m.sql);
      db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        m.version,
        m.name,
        new Date().toISOString(),
      ]);
    });
  }
}
