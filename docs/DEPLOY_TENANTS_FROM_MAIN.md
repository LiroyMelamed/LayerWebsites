# Deploy tenants from `main`

**Rule:** all product work lands on `main` first. **Melamedia is QA** — deploy and smoke-test there before any production client. Tenant branches only receive merges from `main`, then branded builds and deploy. Never build MelamedLaw (or another client) from a different tenant tip.

**Melamedia** is the QA / sales-demo tenant (wipeable demo DB). **MelamedLaw** is a production client. They are independent — branding, icons, and env never merge between them.

The active targets are Melamedia QA and three production clients: MelamedLaw, MorLevi and AshrafEssa. **Idm was retired on 25 October 2026** and is excluded from propagation and deployment. Do not recreate its site, services, database, DNS, storage or credentials. The owner's current inventory is `/Users/liroymelamed/Projects/WORKSPACE.md`.

## Flow (QA gate)

```
main  →  commit + push
      →  merge main into Melamedia
      →  build:melamedia + deploy Melamedia
      →  QA smoke on melamedia.mela-media.co.il
      →  if OK: merge main into MelamedLaw / MorLevi / AshrafEssa
      →  apply-tenant-branding.js + tenant .env (per tenant)
      →  build + deploy each client
      →  prod tag on main
```

Do **not** skip Melamedia QA and deploy all clients in one batch.

## Automation scripts (on `main`)

| Script | Purpose |
|--------|---------|
| `./scripts/propagate-main-to-tenants.sh` | Merge `origin/main` into `Melamedia` only (default QA target; uses git worktrees) |
| `./scripts/propagate-main-to-tenants.sh melamedia` | QA step only — merge main → Melamedia |
| `./scripts/deploy-melamedia-qa.sh` | Full QA gate: propagate Melamedia + deploy backend + frontend |
| `./scripts/deploy-all-tenants-prod.sh` | The four active targets after QA pass (pauses between frontend rsyncs; excludes retired Idm) |

Example after landing a fix on `main`:

```bash
git push origin main
./scripts/deploy-melamedia-qa.sh
# smoke https://melamedia.mela-media.co.il
./scripts/propagate-main-to-tenants.sh melamedlaw morlevy ashrafessa
./scripts/deploy-all-tenants-prod.sh
git tag PROD_DD_MM_YYYY_LIROY && git push origin PROD_DD_MM_YYYY_LIROY
```

Backend deploy runs `npm ci --omit=dev` when `backend/package-lock.json` changes on the server.

## Branding (per tenant — do not mix)

| Committed (yes) | Build scratch (never commit) |
|-----------------|------------------------------|
| `frontend/public/tenants/<tenant>/` | `frontend/public/index.html`, favicons, `firm-logo.png`, `manifest.json` |
| `frontend/public/tenants/<tenant>/logos/` | `frontend/src/assets/images/logos/*` |
| `frontend/.env.production.<tenant>` | |

`prebuild:*` runs `apply-tenant-branding.js`, which copies tenant → scratch before CRA build. After local builds, run:

```bash
./frontend/scripts/restore-public-baseline.sh
```

## Build (per tenant)

From repo root, on the tenant branch after merging `main`:

```bash
cd frontend
# Avoid .env.production.local overriding the tenant API (move aside if present)
[ -f .env.production.local ] && mv .env.production.local .env.production.local.bak

npm run build:melamedlaw   # or build:morlevy / build:ashrafessa / build:melamedia
```

`prebuild:*` runs `apply-tenant-branding.js` and copies the PDF worker.

## Deploy

- **MelamedLaw frontend:** FTP to client host (see `frontend/.env.ftp.local`)
- **MorLevi / AshrafEssa / Melamedia frontend:** `scripts/deploy-tenant-frontend.sh morlevy|ashrafessa|melamedia` (SSH key; do not add new sshpass usage)
- **Backend:** `scripts/deploy-tenant-backend.sh melamedlaw|morlevy|ashrafessa|melamedia <reviewed-40-character-commit>` — never `pm2 restart all`

The all-target backend wrapper requires `SIGNING_RELEASE_PLAN` pointing to a reviewed JSON map with one exact commit for each active target: `melamedlaw`, `morlevy`, `ashrafessa` and `melamedia`. Keep the signing release checks and each tenant's isolated branding, configuration and deployment locks. Explicit `idm` propagation fails before any fetch or remote operation.

## Melamedia hosts

| Role | Host | Notes |
|------|------|--------|
| SPA | `melamedia.mela-media.co.il` → `/var/www/melamedia` | Frontend VPS `84.46.253.85` |
| API | `api-melamedia.mela-media.co.il` → PM2 `melamedia-api` :3003 | Backend VPS `37.60.230.148`, dir `/root/Melamedia` |

After Cloudflare A records point at those IPs, run `scripts/finalize-melamedia-dns.sh` to expand TLS certs and redeploy the SPA.

Demo login phones / seed notes: [DEMO_MELAMEDIA.md](./DEMO_MELAMEDIA.md).

## Smoke after deploy

- OTP: 6-digit auto-submit, no אמת button
- Signed public link: locked / success overlay only
- Leave all-day: single selected day
- Event color: chosen swatch stays active
- Signature spot left stays left in client + stamped PDF
- RSVP badge visible in event form
- Immediate (מיידי) reminder option visible in event + platform settings
