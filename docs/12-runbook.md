# 12. Runbook

Practical tasks for running the demo and the service.
**Live:** https://white-label-hms.onrender.com, **health check:** `/api/health`

## 12.1 Before a demo

1. Open the live URL about a minute early. The free Render service sleeps after 15 minutes idle and takes up to a minute to wake.
2. Check `https://white-label-hms.onrender.com/api/health` returns `{"ok":true,...}`.
3. Optional: in Render → **Environment**, set `AUTO_ADVANCE_SECONDS=20` so statuses move faster while you present. Saving triggers a redeploy (about 2–4 minutes), which also resets the data.
4. Keep the [demo script](14-user-guide.md#142-five-minute-demo-script) open.

## 12.2 Common tasks

| Task | Locally | On Render |
| --- | --- | --- |
| Start | `npm run build && npm start` | Automatic |
| Develop with reload | `npm run dev` | — |
| Run tests | `npm test` | Run during every Docker build |
| Reset demo data | `npm run seed:reset` | Restart the service (free plan), or set `RESET_DB_ON_START=true` once |
| Change status timers | Edit `.env` (see `.env.example`), restart | Environment → edit `AUTO_ADVANCE_SECONDS*` → Save |
| Change prices, menu, brand | Edit `config/hotel.json`, then `npm run seed:reset` | Commit and push; the redeploy re-seeds |
| See logs | Terminal output (JSON lines) | Service → Logs |
| Roll back | `git revert <commit>` | Service → Events → previous deploy → Rollback |
| Open a guest's stay | `/stay/<Stay ID>` | same |
| Recover a lost Stay ID | Manage booking with reference + last name | same |

Changes to room types or the catalogue in `hotel.json` only reach an existing database after a reset, because seeding runs on an empty database. Brand, taxes, policies, Wi-Fi, hours and the local guide are read live from the file at start-up.

## 12.3 Troubleshooting

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| Site takes ~1 min to open | Free instance was asleep | Wait; open it before demos |
| Bookings disappeared | Service restarted or redeployed (no disk on free plan) | Expected on free plan; add a disk on a paid plan to keep data |
| "Online check-in opens on …" | Booking starts on a later date | Book for today, or set `EARLY_CHECKIN_DAYS` |
| "Stay not found. Check your Stay ID." | Typo, or the data was reset | Use Manage booking to recover it; re-book after a reset |
| "Too many attempts. Try again in N seconds." | 30 failed lookups in a minute from this IP | Wait for the time shown |
| Statuses not moving | `AUTO_ADVANCE_ENABLED=false`, or long timers | Check env; logs show `scheduler started` with the timer values |
| Spa shows no free times | Less than 60 minutes' notice, or all 3 rooms taken | Pick a later time or another day |
| Transfer refused | Less than 2 hours' notice, after check-out day, or too many passengers | Adjust time, day or car |
| Build fails on Render | Usually a failing test or dependency install | Open the build log; run `npm test` locally |
| Service unhealthy | App crashed at start, often invalid env or `hotel.json` | Logs show the exact field, e.g. `Invalid hotel config at ./config/hotel.json: brand.colors.primary: expected a #rrggbb colour` |

## 12.4 Log lines to know

```json
{"msg":"database seeded","hotel":"Saffron Bay Hotel & Spa"}
{"msg":"scheduler started","autoAdvance":true,"tickSeconds":5,"secondsByService":{"food":60,"laundry":90,...}}
{"msg":"listening","url":"http://localhost:3000","env":"production"}
{"msg":"request","method":"POST","path":"/api/reservations","status":201,"ms":4}
{"msg":"scheduler tick","advanced":3,"cleaned":0}
{"msg":"unhandled error","path":"/api/...","error":"<stack>"}
```

## 12.5 Test card and sample data

- Card: `4242 4242 4242 4242`, any future expiry (e.g. `12/29`), any 3-digit code. No money moves.
- ID: any document number of 5+ characters; only the last 4 are stored.
- Flight number format: `EK 203`.
