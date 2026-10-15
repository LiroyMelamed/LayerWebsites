# Deploy tenants from `main`

**Rule:** all product work lands on `main` first. Tenant branches (`MelamedLaw`, `MorLevi`, `AshrafEssa`, `Melamedia`, `Idm`) only receive merges from `main`, then branded builds and deploy. Never build MelamedLaw (or another tenant) from a different tenant tip — including **never** building production tenants from the `Melamedia` QA tip.

**Melamedia** is the QA / sales-demo tenant (wipeable demo DB). Production client data must never be copied into it.

## Flow

```
main  →  merge into MelamedLaw / MorLevi / AshrafEssa / Melamedia / Idm
      →  apply-tenant-branding.js + tenant .env
      →  build
      →  deploy (FTP MelamedLaw / rsync MorLevi+AshrafEssa+Melamedia+Idm)
```

## Build (per tenant)

From repo root, on the tenant branch after merging `main`:

```bash
cd frontend
# Avoid .env.production.local overriding the tenant API (move aside if present)
[ -f .env.production.local ] && mv .env.production.local .env.production.local.bak

npm run build:melamedlaw   # or build:morlevy / build:ashrafessa / build:melamedia / build:idm
```

`prebuild:*` runs `apply-tenant-branding.js` and copies the PDF worker.

## Deploy

- **MelamedLaw frontend:** FTP to client host (see `frontend/.env.ftp.local`)
- **MorLevi / AshrafEssa / Melamedia / Idm frontend:** `scripts/deploy-tenant-frontend.sh morlevy|ashrafessa|melamedia|idm` (SSH key; do not add new sshpass usage)
- **Backend:** `scripts/deploy-tenant-backend.sh morlevy|ashrafessa|melamedia|idm` — never `pm2 restart all`

## Melamedia hosts

| Role | Host | Notes |
|------|------|--------|
| SPA | `melamedia.mela-media.co.il` → `/var/www/melamedia` | Frontend VPS `84.46.253.85` |
| API | `api-melamedia.mela-media.co.il` → PM2 `melamedia-api` :3003 | Backend VPS `37.60.230.148`, dir `/root/Melamedia` |

After Cloudflare A records point at those IPs, run `scripts/finalize-melamedia-dns.sh` to expand TLS certs and redeploy the SPA.

Demo login phones / seed notes: [DEMO_MELAMEDIA.md](./DEMO_MELAMEDIA.md).

## Idm hosts

| Role | Host | Notes |
|------|------|--------|
| SPA | `idm.mela-media.co.il` → `/var/www/idm` | Frontend VPS `84.46.253.85` |
| API | `api-idm.mela-media.co.il` → PM2 `idm-api` :3004 | Backend VPS `37.60.230.148`, dir `/root/Idm` |

After Cloudflare A records point at those IPs, run `scripts/finalize-idm-dns.sh` to expand TLS certs and redeploy the SPA. First Admin OTP: `0507299064`. Empty DB (no Melamedia seed).

## Smoke after deploy

- OTP: 6-digit auto-submit, no אמת button
- Signed public link: locked / success overlay only
- Leave all-day: single selected day
- Event color: chosen swatch stays active
- Signature spot left stays left in client + stamped PDF
- RSVP badge visible in event form
- Immediate (מיידי) reminder option visible in event + platform settings
