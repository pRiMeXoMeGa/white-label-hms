# 4. Deployment and DevOps

**Live demo:** https://white-label-hms.onrender.com
**Related:** [Runbook](12-runbook.md), [Performance and scaling](09-performance-scalability.md)

## 4.1 Environments

| Environment | Where | Database | Timers | Purpose |
| --- | --- | --- | --- | --- |
| Local dev | `npm run dev` on a laptop | `./data/hms.sqlite` | from `.env` | Development with auto-rebuild and restart |
| Local prod-like | `npm run build && npm start` | `./data/hms.sqlite` | from `.env` | Check the production bundle |
| CI | GitHub Actions, Ubuntu, Node 22 | `/tmp/e2e.sqlite` | 4 s (fast e2e) | Typecheck, tests, build, browser journey |
| Demo (production) | Render web service, Docker, free plan | `/data/hms.sqlite` inside the container (ephemeral) | from `render.yaml` | Shared with reviewers |

## 4.2 Build and runtime

```mermaid
flowchart LR
  subgraph Build["Docker build stage (node:22-slim)"]
    A[npm install] --> B[npm test<br/>20 tests] --> C[npm run build<br/>esbuild]
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
- The container runs as the unprivileged `node` user and writes only to `/data`.
- `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` keeps the e2e browser out of the image.

Commands:

| Command | What it does |
| --- | --- |
| `npm run build` | Client bundle with content-hashed names + `index.html`; server bundle `dist/server/index.js` |
| `npm start` | `node --env-file-if-exists=.env dist/server/index.js` |
| `npm run dev` | esbuild watch for the client + `node --watch` for the server |
| `docker build -t hms . && docker run -p 3000:3000 -v hms-data:/data hms` | Run the image locally with a persistent volume |

## 4.3 Render setup

[`render.yaml`](../render.yaml) is a Render Blueprint: Render reads it to create and configure the service.

| Setting | Value |
| --- | --- |
| Type / runtime | Web service, Docker (uses the repo `Dockerfile`) |
| Plan | Free |
| Health check | `GET /api/health` (must return 2xx before traffic switches) |
| Auto-deploy | On every push to `main` |
| Env vars | `NODE_ENV=production`, `AUTO_ADVANCE_SECONDS=10` (and `_FOOD`, `_LAUNDRY` = 10), `AUTO_ADVANCE_TICK_SECONDS=2`, `EARLY_CHECKIN_DAYS=0` |
| TLS | Managed by Render (`https://white-label-hms.onrender.com`) |

**First deploy:** Render dashboard → New → Blueprint → select the repo → Apply.

**Free-plan behaviour to plan around**

| Behaviour | Effect on the demo | Mitigation |
| --- | --- | --- |
| Sleeps after 15 min without traffic; ~1 min to wake | First visitor waits | Open the link a minute before a demo |
| No persistent disk | Database resets on restart or redeploy (re-seeded automatically) | Fine for a demo; paid plan + disk for real use |
| 512 MB RAM, 0.1 CPU | Enough for this app | Upgrade plan for load |

To keep data across restarts: switch the plan to Starter and uncomment the `disk` block in `render.yaml` (mount at `/data`).

## 4.4 CI/CD pipeline

```mermaid
flowchart LR
  P[push / pull request] --> I[npm install]
  I --> T1[npm run typecheck]
  T1 --> T2[npm test]
  T2 --> B[npm run build]
  B --> E["start app with 4 s timers<br/>npm run e2e (Playwright)"]
  E --> S[upload screenshots artifact]
  P -.->|push to main| R[Render auto-deploy<br/>Docker build runs tests again]
```

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every push to `main` and every pull request. The e2e step books, checks in, orders, books spa and transfer, checks out and downloads the invoice in headless Chromium, failing on any browser console error. Screenshots are uploaded as a build artifact for review.

**Release flow:** branch → pull request (CI must pass) → merge to `main` → Render builds and deploys → health check passes → traffic switches to the new version.

## 4.5 Configuration reference

All variables are optional; defaults are in [`src/server/config/env.ts`](../src/server/config/env.ts) and validated at start-up (the process exits with a clear message on a bad value).

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` caches `index.html` |
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATABASE_PATH` | `./data/hms.sqlite` | SQLite file (`:memory:` for tests) |
| `HOTEL_CONFIG_PATH` | `./config/hotel.json` | White-label config |
| `CLIENT_DIR` | `./dist/client` | Built web client |
| `RESET_DB_ON_START` | `false` | Delete and re-seed the database on boot |
| `AUTO_ADVANCE_ENABLED` | `true` | Simulated staff on/off |
| `AUTO_ADVANCE_TICK_SECONDS` | `5` | Scheduler interval |
| `AUTO_ADVANCE_SECONDS` | `60` | Default seconds per status |
| `AUTO_ADVANCE_SECONDS_FOOD` … `_TRANSFER` | default | Per-service override (FOOD, LAUNDRY, HOUSEKEEPING, AMENITY, MAINTENANCE, SPA, TRANSFER) |
| `HOUSEKEEPING_TURNAROUND_SECONDS` | `300` | Dirty room becomes clean after this |
| `EARLY_CHECKIN_DAYS` | `0` | Online check-in opens N days before arrival |
| `RATE_LIMIT_PER_MINUTE` | `30` | Failed lookups allowed per IP per minute |

Property-specific settings (brand, prices, taxes, catalogue) live in `config/hotel.json`, not in env vars. See the [operator guide](14-user-guide.md#143-operator-guide).

## 4.6 Observability

- **Logs:** one JSON line per API request (`method`, `path`, `status`, `ms`) and per scheduler tick that changed something (`advanced`, `cleaned`); unhandled errors log the stack. View them in Render → service → Logs.
- **Health:** `GET /api/health` → `{"ok":true,"today":"2026-11-19"}`; used by Render and the Docker `HEALTHCHECK`.
- **Next steps for production:** ship logs to a log service, add request IDs, metrics (request rate, latency, scheduler lag) and uptime alerts.

## 4.7 Backup, restore and rollback

| Task | How |
| --- | --- |
| Roll back a bad deploy | Render → service → Events → pick the previous deploy → Rollback; or `git revert` and push |
| Back up data (with a disk) | From the Render shell: `node -e "new (require('node:sqlite').DatabaseSync)('/data/hms.sqlite').exec(\"VACUUM INTO '/data/backup.sqlite'\")"` (a consistent copy while running), then download it or copy it to object storage on a schedule |
| Restore | Stop the service, replace `/data/hms.sqlite`, start |
| Reset demo data | Restart the service on the free plan, or set `RESET_DB_ON_START=true` once |

Schema migrations are forward-only and run at boot, so rolling back code after a migration that added tables is safe (old code ignores new tables). Destructive schema changes should be split into two releases.

## 4.8 Other hosts

The image runs anywhere Docker runs. Mount a volume at `/data` to keep the database.

| Host | Notes |
| --- | --- |
| Railway | Deploy from GitHub with the Dockerfile; add a volume at `/data` |
| Fly.io | `fly launch`, `fly volumes create data`, mount at `/data` |
| Any VM | `docker run -d -p 80:3000 -v /srv/hms:/data --restart unless-stopped hms` behind a TLS proxy |
