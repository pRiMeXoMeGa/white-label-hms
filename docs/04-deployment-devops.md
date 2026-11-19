# 4. Deployment and DevOps

**Live demo:** https://white-label-hms.onrender.com
**Related:** [Runbook](12-runbook.md), [Performance and scaling](09-performance-scalability.md)

This document describes how I build, ship and run the app.

## 4.1 Environments

| Environment | Where | Database | Timers | Purpose |
| --- | --- | --- | --- | --- |
| Local dev | `npm run dev` on a laptop | `./data/hms.sqlite` | from `.env` | Development with auto-rebuild and restart |
| Local prod-like | `npm run build && npm start` | `./data/hms.sqlite` | from `.env` | Checking the production bundle |
| CI | GitHub Actions, Ubuntu, Node 22 | `/tmp/e2e.sqlite` | 4 s (fast e2e) | Typecheck, tests, build, browser journey, responsive check, Docker image build |
| Demo (production) | Render web service, Docker, free plan | `/data/hms.sqlite` inside the container (ephemeral) | from `render.yaml` | Shared with reviewers |

## 4.2 Build and runtime

```mermaid
flowchart LR
  subgraph Build["Docker build stage (node:22-slim)"]
    A["npm ci<br/>(npm install without a lockfile)"] --> B[npm test<br/>31 tests] --> C[npm run build<br/>esbuild]
  end
  C --> D["dist/client<br/>hashed JS + CSS, index.html"]
  C --> E["dist/server/index.js<br/>single bundled file incl. zod, pdf-lib"]
  subgraph Run["Runtime stage (node:22-slim)"]
    D2[dist/] --- F[config/hotel.json]
    G["USER node, EXPOSE 3000,<br/>HEALTHCHECK /api/health"]
  end
  D --> D2
  E --> D2
```

- The **build stage** fails the image if any test fails, so a broken commit never reaches production.
- The **runtime stage** contains only `dist/` and `config/`; there is no `node_modules` at runtime because esbuild bundles the server's dependencies into one file.
- The container runs as the unprivileged `node` user (uid 1000) and writes only to `/data`. A host folder bind-mounted on `/data` has to be writable by uid 1000 (`chown 1000:1000` on the host folder); a named Docker volume needs nothing extra.
- The client bundle is built without source maps, and the server does not serve `.map` files.
- `.dockerignore` keeps `node_modules`, `dist`, `data`, `docs`, `README.md`, `.github` and `.env` out of the build context.
- `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` keeps the e2e browser out of the image.

The commands I use:

| Command | What it does |
| --- | --- |
| `npm run build` | Client bundle with content-hashed names + `index.html`; server bundle `dist/server/index.js` |
| `npm start` | `node --env-file-if-exists=.env dist/server/index.js` |
| `npm run dev` | esbuild watch for the client + `node --watch` for the server; `.env` is loaded when it exists |
| `docker build -t hms . && docker run -p 3000:3000 -v hms-data:/data hms` | Runs the image locally with a persistent volume |

## 4.3 Render setup

I deploy with a Render Blueprint, [`render.yaml`](../render.yaml), which Render reads to create and configure the service.

| Setting | Value |
| --- | --- |
| Type / runtime | Web service, Docker (uses the repo `Dockerfile`) |
| Plan | Free |
| Health check | `GET /api/health` (must return 2xx before traffic switches) |
| Auto-deploy | On every push to `main` |
| Env vars | `NODE_ENV=production`, `AUTO_ADVANCE_SECONDS=10`, `AUTO_ADVANCE_SECONDS_FOOD=10`, `AUTO_ADVANCE_SECONDS_LAUNDRY=10`, `AUTO_ADVANCE_TICK_SECONDS=2`, `EARLY_CHECKIN_DAYS=0` |
| TLS | Managed by Render (`https://white-label-hms.onrender.com`) |

I created the service through Render's Blueprint flow (New → Blueprint → this repository → Apply); since then every push to `main` deploys automatically.

**Free-plan behaviour and how I handle it**

| Behaviour | Effect on the demo | How I handle it |
| --- | --- | --- |
| Stops after 15 min without traffic; ~1 min to wake, and the restart clears the database | Guests lose their stay after a quiet spell | The app pings its own `/api/health` every 10 min (`KEEP_ALIVE_MINUTES`, using Render's `RENDER_EXTERNAL_URL`), so the service never idles; this uses about 720 of the 750 free hours a month |
| No persistent disk | Database is cleared on every deploy or restart (re-seeded automatically) | I avoid deploying while the demo is being reviewed; keeping data across deploys takes a paid plan with a disk |
| 512 MB RAM, 0.1 CPU | Enough for this app | A larger plan for real load |

The `disk` block in `render.yaml` is commented out because the free plan has no disks. On the Starter plan with that block enabled (mounted at `/data`), data survives restarts.

## 4.4 CI/CD pipeline

```mermaid
flowchart LR
  P[push / pull request] --> I["npm ci<br/>(npm install without a lockfile)"]
  I --> T1[npm run typecheck]
  T1 --> T2[npm test]
  T2 --> B[npm run build]
  B --> E["start app: 4 s timers,<br/>RATE_LIMIT_PER_MINUTE=1000<br/>npm run e2e + e2e:responsive"]
  E --> S[upload screenshots artifact]
  P --> D["docker job:<br/>docker build"]
  P -.->|push to main| R[Render auto-deploy<br/>Docker build runs tests again]
```

My pipeline, [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), runs on every push to `main` and every pull request, as two jobs with a 15-minute limit each. The test job waits up to 60 s for the started app (`wait-on`), then the e2e step books, checks in, orders, books spa and transfer, checks out and downloads the invoice in headless Chromium, failing on any browser console error; the responsive step loads 12 pages at 8 screen sizes and fails on horizontal overflow. Screenshots are uploaded as a build artifact for review. The docker job builds the production image, which also runs the tests inside the build.

**My release flow:** branch → pull request (CI must pass) → merge to `main` → Render builds and deploys → health check passes → traffic switches to the new version.

## 4.5 Configuration reference

All variables are optional; defaults are in [`src/server/config/env.ts`](../src/server/config/env.ts) and validated at start-up (the process exits with a clear message on a bad value). An empty value counts as not set, and `true`/`false` are accepted in any letter case.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` and `test` are themselves; any other value counts as `production`, which caches `index.html`, sends HSTS and turns on the keep-alive ping |
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATABASE_PATH` | `./data/hms.sqlite` | SQLite file (`:memory:` for tests) |
| `HOTEL_CONFIG_PATH` | `./config/hotel.json` | White-label config |
| `CLIENT_DIR` | `./dist/client` | Built web client |
| `RESET_DB_ON_START` | `false` | Delete and re-seed the database on boot |
| `AUTO_ADVANCE_ENABLED` | `true` | Simulated staff on/off |
| `AUTO_ADVANCE_TICK_SECONDS` | `2` | Scheduler interval |
| `AUTO_ADVANCE_SECONDS` | `10` | Default seconds per status |
| `AUTO_ADVANCE_SECONDS_FOOD` … `_TRANSFER` | default | Per-service override (FOOD, LAUNDRY, HOUSEKEEPING, AMENITY, MAINTENANCE, SPA, TRANSFER) |
| `HOUSEKEEPING_TURNAROUND_SECONDS` | `300` | Dirty room becomes clean after this |
| `EARLY_CHECKIN_DAYS` | `0` | Online check-in opens N days before arrival |
| `RATE_LIMIT_PER_MINUTE` | `30` | Failed lookups (a booking reference or Stay ID that does not exist) allowed per client address per minute; the general budget is 10 times this, at least 300, per Stay ID or address |
| `TRUST_PROXY_HOPS` | `2` on Render, otherwise `1` | How many proxies in front of the app add to `X-Forwarded-For` (Render: Cloudflare and Render's proxy, so 2; the app detects Render from its `RENDER=true` variable); `0` uses the socket address |
| `KEEP_ALIVE_URL` | `RENDER_EXTERNAL_URL` | Public URL the app pings to stay awake (Render sets `RENDER_EXTERNAL_URL` automatically) |
| `KEEP_ALIVE_MINUTES` | `10` | Minutes between keep-awake pings; `0` turns it off (only active when `NODE_ENV=production`) |

Property-specific settings (brand, prices, taxes, catalogue) live in `config/hotel.json`, not in env vars; the [operator guide](14-user-guide.md#142-operator-guide) describes them.

## 4.6 Observability

- **Logs:** one JSON line per API request (`method`, `path`, `status`, `ms`) and per scheduler tick that changed something (`advanced`, `cleaned`); unhandled errors log the stack. Booking references and Stay IDs in paths are written as `:code`, so logs hold no guest keys. Render shows them under the service's Logs.
- **Health:** `GET /api/health` → `{"ok":true,"today":"2026-11-19","autoAdvance":{"enabled":true,"tickSeconds":2,"secondsByService":{"food":10,...}}}`; used by Render and the Docker `HEALTHCHECK`, and shows the timer values the running service is using.
- **Planned for production:** shipping logs to a log service, request IDs, metrics (request rate, latency, scheduler lag) and uptime alerts.

## 4.7 Backup, restore and rollback

| Task | How I do it |
| --- | --- |
| Roll back a bad deploy | Rollback to the previous deploy from Render's deploy history, or `git revert` and a push |
| Back up data (with a disk) | From the Render shell I run `node -e "new (require('node:sqlite').DatabaseSync)('/data/hms.sqlite').exec(\"VACUUM INTO '/data/backup.sqlite'\")"` (a consistent copy while the app runs) and copy the file to object storage |
| Restore | Stop the service, replace `/data/hms.sqlite`, start it again |
| Reset demo data | A restart on the free plan, or one deploy with `RESET_DB_ON_START=true` |

Schema migrations are forward-only and run at boot, so rolling back code after a migration that added tables is safe (old code ignores new tables; code from before migration 2 would number invoices by counting rows again). I split destructive schema changes into two releases.

## 4.8 Other hosts

The image runs anywhere Docker runs, with a volume at `/data` for the database.

| Host | How it runs there |
| --- | --- |
| Railway | Built from GitHub with the Dockerfile, volume at `/data` |
| Fly.io | `fly launch` with a `data` volume mounted at `/data` |
| Any VM | `docker run -d -p 80:3000 -v /srv/hms:/data --restart unless-stopped hms` behind a TLS proxy, with `/srv/hms` owned by uid 1000 |
