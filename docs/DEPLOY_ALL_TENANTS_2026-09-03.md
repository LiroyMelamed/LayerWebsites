# Production deploy — all tenants (2026-09-03 ~20:00)

Run from repo root after **all tenant branches are pushed** to GitHub.

## Pre-flight (local)

```bash
git fetch origin
git checkout main && git pull origin main
# Confirm each tenant branch contains latest main:
for b in MelamedLaw MorLevi AshrafEssa Melamedia Idm; do
  git log --oneline -1 origin/$b
done
```

Optional — verify builds before touching prod:

```bash
cd frontend
for t in melamedlaw morlevy ashrafessa melamedia idm; do npm run build:$t; done
cd ..
```

## MelamedLaw billing (already applied)

- Complimentary / no-block extended to **12/09/2026** on prod DB + `.env`
- Do **not** reset `FIRM_DEFAULT_UNLIMITED_UNTIL_UTC` or `firm_billing.complimentary_until` during deploy
- After Upay accepts Diners: add card under **תוכנית ושימוש**

## Deploy command

```bash
./scripts/deploy-all-tenants-prod.sh
```

Dry run first:

```bash
./scripts/deploy-all-tenants-prod.sh --dry-run
```

Backend only / frontend only:

```bash
./scripts/deploy-all-tenants-prod.sh --backend
./scripts/deploy-all-tenants-prod.sh --frontend
```

## Per-tenant map

| Tenant | Backend dir | PM2 | DB | Frontend deploy |
|--------|-------------|-----|-----|-----------------|
| **MelamedLaw** | `/root/LayerWebsites` | `melamed-backend` :3000 | `melamedlaw` | FTP → `client.melamedlaw.co.il` (`.env.ftp.local`) |
| **MorLevi** | `/root/MorLevi` | `morlevy-api` :3001 | `morlevy` | rsync → `morlevy.mela-media.co.il` |
| **AshrafEssa** | `/root/AshrafEssa` | `ashrafessa-api` :3002 | `ashrafessa` | rsync → `ashrafessa.mela-media.co.il` |
| **Melamedia** | `/root/Melamedia` | `melamedia-api` :3003 | `melamedia` | rsync → `melamedia.mela-media.co.il` |
| **Idm** | `/root/Idm` | `idm-api` :3004 | `idm` | rsync → `idm.mela-media.co.il` |

**Never** `pm2 restart all`.

## Migrations

`deploy-tenant-backend.sh` applies `backend/migrations/*.sql` idempotently per tenant DB.

Notable migration in this release:

- `2026-09-02_01_signing_signer_delivery.sql` — signer delivery method column

## Smoke tests (after deploy)

| Area | Check |
|------|--------|
| OTP login | 6-digit auto-submit |
| Signing | Replace signer, delivery channel locked when email-only; stamp + signature composite |
| Calendar | Employee calendar in סינון מתקדם; expand/collapse centered; partial RSVP |
| CRM | Company name search in client popup |
| MelamedLaw billing | Still unlocked; shows complimentary until 12/09 |

## Rollback

Each server keeps git history — SSH in, `git log`, `git checkout <prev-commit>`, `pm2 restart <process>`.

MelamedLaw frontend: re-upload previous build from local `frontend/build` if kept.

## Client release note (Hebrew)

Use the release message prepared for **03/09/2026 20:00** (15–18 bullet points: signing, calendar, CRM, reminders).
