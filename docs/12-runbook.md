# 12. Runbook

How I run, operate and troubleshoot the app.
**Live:** https://white-label-hms.onrender.com, **health check:** `/api/health`

## 12.1 Live site checks

1. The free Render service sleeps after 15 minutes idle and takes up to a minute to wake on the next visit.
2. `https://white-label-hms.onrender.com/api/health` returns `{"ok":true,...}` when the service is up.
3. Statuses move every 10 seconds on the live site (`AUTO_ADVANCE_SECONDS=10`). The timer variables are under **Environment** in Render; saving a change there triggers a redeploy (about 2–4 minutes), which also resets the data.

## 12.2 Everyday tasks

| Task | Locally | On Render |
| --- | --- | --- |
| Start | `npm run build && npm start` | Automatic on every push to `main` |
| Develop with reload | `npm run dev` | — |
| Run tests | `npm test` | Run during every Docker build |
| Reset demo data | `npm run seed:reset` | A service restart (free plan), or one deploy with `RESET_DB_ON_START=true` |
| Change status timers | `.env` (template in `.env.example`), then a restart | `AUTO_ADVANCE_SECONDS*` under Environment, then Save |
| Change prices, menu, brand | `config/hotel.json`, then `npm run seed:reset` | A commit and push; the redeploy re-seeds |
| Read logs | Terminal output (JSON lines) | The service's Logs tab |
| Roll back | `git revert <commit>` | Rollback to the previous deploy in Render's deploy history |
| Open a guest's stay | `/stay/<Stay ID>` | same |
| Recover a lost Stay ID | Manage booking with reference + last name | same |

Changes to room types or the catalogue in `hotel.json` only reach an existing database after a reset, because seeding runs on an empty database. Brand, taxes, policies, Wi-Fi, hours and the local guide are read from the file at start-up.

## 12.3 Troubleshooting

| Symptom | Cause | Resolution |
| --- | --- | --- |
| Site takes ~1 min to open | Free instance was asleep | It wakes by itself within about a minute |
| Bookings disappeared | Service restarted or redeployed (no disk on the free plan) | Expected on the free plan; a paid plan with a disk keeps data |
| "Online check-in opens on …" | Booking starts on a later date | Check-in opens on the arrival day, or earlier with `EARLY_CHECKIN_DAYS` |
| "Stay not found. Check your Stay ID." | Typo, or the data was reset | Manage booking recovers the Stay ID; after a reset the booking no longer exists |
| "Too many attempts. Try again in N seconds." | 30 failed lookups in a minute from one IP | Lookups work again after the time shown |
| Statuses not moving | `AUTO_ADVANCE_ENABLED=false`, or timers changed from the 10 s default | The `scheduler started` log line shows the active timer values |
| Spa shows no free times | Less than 60 minutes' notice, or all 3 rooms taken | Later times or another day are available |
| Transfer refused | Less than 2 hours' notice, after the check-out day, or too many passengers for the car | The error message names the rule |
| Build fails on Render | A failing test or a dependency install error | The build log shows the failing step; `npm test` reproduces test failures locally |
| Service unhealthy | App stopped at start, usually invalid env or `hotel.json` | Logs show the exact field, e.g. `Invalid hotel config at ./config/hotel.json: brand.colors.primary: expected a #rrggbb colour` |

## 12.4 Log lines

```json
{"msg":"database seeded","hotel":"Saffron Bay Hotel & Spa"}
{"msg":"scheduler started","autoAdvance":true,"tickSeconds":2,"secondsByService":{"food":10,"laundry":10,...}}
{"msg":"listening","url":"http://localhost:3000","env":"production"}
{"msg":"request","method":"POST","path":"/api/reservations","status":201,"ms":4}
{"msg":"scheduler tick","advanced":3,"cleaned":0}
{"msg":"unhandled error","path":"/api/...","error":"<stack>"}
```

## 12.5 Test data

- Card: `4242 4242 4242 4242`, any future expiry (e.g. `12/29`), any 3-digit code. No money moves.
- ID: any document number of 5+ characters; only the last 4 are stored.
- Flight number format: `EK 203`.
