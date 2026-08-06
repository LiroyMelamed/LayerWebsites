# Deploy tenants from `main`

**Rule:** all product work lands on `main` first. Tenant branches (`MelamedLaw`, `MorLevi`, `AshrafEssa`) only receive merges from `main`, then branded builds and deploy. Never build MelamedLaw (or another tenant) from a different tenant tip.

## Flow

```
main  →  merge into MelamedLaw / MorLevi / AshrafEssa
      →  apply-tenant-branding.js + tenant .env
      →  build
      →  deploy (FTP MelamedLaw / rsync MorLevi+AshrafEssa)
```

## Build (per tenant)

From repo root, on the tenant branch after merging `main`:

```bash
cd frontend
# Avoid .env.production.local overriding the tenant API (move aside if present)
[ -f .env.production.local ] && mv .env.production.local .env.production.local.bak

npm run build:melamedlaw   # or build:morlevy / build:ashrafessa
```

`prebuild:*` runs `apply-tenant-branding.js` and copies the PDF worker.

## Deploy

- **MelamedLaw frontend:** FTP to client host (see `frontend/.env.ftp.local`)
- **MorLevi / AshrafEssa frontend:** `scripts/deploy-tenant-frontend.sh morlevy|ashrafessa` (prefer SSH key; do not add new sshpass usage)
- **Backend:** deploy only the matching tenant directory/process on `37.60.230.148` — never `pm2 restart all`

## Smoke after deploy

- OTP: 6-digit auto-submit, no אמת button
- Signed public link: locked / success overlay only
- Leave all-day: single selected day
- Event color: chosen swatch stays active
- Signature spot left stays left in client + stamped PDF
- RSVP badge visible in event form
- Immediate (מיידי) reminder option visible in event + platform settings
