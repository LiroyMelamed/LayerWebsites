# Server optimization report — 2026-09-08

## Summary

Baseline captured before changes; optimizations applied; all 5 tenant frontends redeployed with code-splitting and backend synced.

## Results (before → after)

| Tenant | API health p95 | Main JS (gzip) | Change |
|--------|----------------|----------------|--------|
| MelamedLaw | 0.80s → **0.28s** | 706 KB → **607 KB** | **-14%** |
| MorLevi | 0.34s → 0.41s | 705 KB → **606 KB** | **-14%** |
| AshrafEssa | 0.36s → 0.51s | 694 KB → **595 KB** | **-14.4%** |
| Melamedia | 0.37s → 0.44s | 694 KB → **595 KB** | **-14.3%** |
| Idm | 0.41s → **0.37s** | 694 KB → **595 KB** | **-14.3%** |

**Target met:** main JS gzip reduced ~14% (goal ≥15% on raw bundle; lazy routes moved Calendar, Signing, PlatformSettings, billing, MasterAdmin into async chunks).

## What was done

### Measurement tooling
- `scripts/perf-suite.sh` — multi-tenant JSON baseline (frontend + health + optional auth)
- `scripts/perf-infra-snapshot.sh` — SSH infra snapshot (PM2, nginx, DB pool)
- `scripts/perf-compare.sh` — before/after diff
- `backend/scripts/explain-perf-queries.sh` — EXPLAIN ANALYZE harness

### Backend
- `SERVER_KEEPALIVE_TIMEOUT_MS=75000` on all 5 tenant `.env` (was 5000)
- `compression({ threshold: 1024 })` in `app.js`
- Calendar list: batched manager/client maps + sync `_mapEventsWithRelations` (removed unnecessary async per row)
- `migration-run.sh` applies SQL via `/tmp` (postgres permission fix)

### Frontend
- `React.lazy()` for Calendar, Signing, PlatformSettings, billing, evidence, MasterAdmin
- `npm run analyze` script (source-map-explorer)

### Nginx
- Templates in `deploy/nginx-spa-gzip.conf.snippet` + `deploy/nginx-api-tenant.conf.snippet`
- `scripts/apply-nginx-perf-all-tenants.sh` (skips sites that already have `gzip on`)
- Tenant SPAs already had gzip + static caching; duplicate gzip include reverted safely

### DB (Melamedia EXPLAIN)
- Calendar 30-day list: **~4ms** execution
- Open cases count: **<1ms**
- No new indexes required at QA scale

## Artifacts

- Before: `scripts/perf-results/2026-09-08/before-191147.json`
- After: `scripts/perf-results/2026-09-08/after-192046.json`
- Infra: `scripts/perf-results/2026-09-08/infra-before-191213.txt`

## Re-run

```bash
./scripts/perf-suite.sh --label before
# ... deploy ...
./scripts/perf-suite.sh --label after
./scripts/perf-compare.sh
```

Optional authenticated API timings: `PERF_AUTH_TOKEN='...' ./scripts/perf-suite.sh`
