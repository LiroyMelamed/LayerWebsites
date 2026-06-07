# CLAUDE.md — Project Context for Claude Code

## Project
Melamedia builds and operates a legal practice management platform for Israeli law firm(s).
MelamedLaw is a client deployment/brand (not the overall company/app name).
Hebrew-first UI. Example client domain: client.melamedlaw.co.il

## Tech Stack
- **Frontend**: React 18 SPA (CRA), react-router-dom v6, SCSS, Firebase Realtime DB, Axios, i18next (Hebrew primary)
- **Backend**: Express 4 on Node.js, PostgreSQL (pg driver, no ORM), PM2 for process management
- **Auth**: OTP-based login (SMS, no passwords), JWT (HS256), refresh token rotation
- **Storage**: Cloudflare R2 / S3-compatible (AWS SDK v3)
- **PDF**: pdf-lib, puppeteer, pdfjs-dist
- **SMS**: Twilio + MessageBird, Smoove
- **Email**: Nodemailer + Smoove for campaigns
- **Push**: Firebase Admin (Expo push tokens)

## Project Structure
- `frontend/` — React SPA (CRA)
- `backend/` — Express API server
- `backend/controllers/` — Route handlers
- `backend/routes/` — Express routes
- `backend/middlewares/` — Auth, error handling
- `backend/migrations/` — Pure SQL migration files
- `backend/services/` — Business logic
- `backend/scripts/` — Utility scripts
- `backend/lib/` — Shared libraries (plans, limits, usage)

## Database
- PostgreSQL, pure SQL (no ORM)
- Migrations are plain .sql files in `backend/migrations/`

## Roles
- Admin, Lawyer, Client (customer), PlatformAdmin (super-admin)

## Deployment — CRITICAL
Backend server (37.60.230.148) hosts all 3 LayerWebsites tenants + BarberBooking API:
- **MelamedLaw**: /root/LayerWebsites, branch `MelamedLaw`, PM2 `melamed-backend`, port 3000, nginx `api.calls.melamedlaw.co.il`
- **MorLevi**: /root/MorLevi, branch `MorLevi`, PM2 `morlevy-api`, port 3001, nginx `api-morlevy.mela-media.co.il`
- **AshrafEssa**: /root/AshrafEssa, branch `AshrafEssa`, PM2 `ashrafessa-api`, port 3002, nginx `api-ashrafessa.mela-media.co.il`
- **BarberBooking API**: PM2 `barber-api`, port 4000, nginx `api-barber.mela-media.co.il`
- **Other**: PM2 `contractor-monitor` (helper service)

Frontend server (84.46.253.85) — separate VPS:
- **MorLevi** SPA: nginx `morlevy.mela-media.co.il` → /var/www/morlevy/
- **AshrafEssa** SPA: nginx `ashrafessa.mela-media.co.il` → /var/www/ashrafessa/
- **BarberBooking web**: PM2 `barber-web` (Next.js 14, port 3000), nginx `barber.mela-media.co.il`
- MelamedLaw frontend NOT on this server.

Rules:
- NEVER run `pm2 restart all` — always restart specific process only
- NEVER do git operations on /root/LayerWebsites unless explicitly working on MelamedLaw
- All tenant deployments are COMPLETELY SEPARATE despite sharing the same GitHub repo
- Frontend build is manual — `cd frontend && npm run build`, then upload build folder

## Server access
- Both servers: `root@37.60.230.148` / `root@84.46.253.85`
- **Password SSH is DISABLED.** Use SSH key only: `ssh -i ~/.ssh/id_ed25519 root@<host>` (ED25519, fingerprint `SHA256:pSzkEd+SYiyYdX/MXy09df9OVlUCJEoCAdNKXwKkRnQ`)
- Hardened sshd config: `/etc/ssh/sshd_config.d/01-melamedia-hardening.conf` (root prohibit-password, MaxAuthTries 3, no X11/agent/TCP forwarding)
- Do NOT add new `sshpass` calls in scripts — use the key instead. Existing scripts in `backend/scripts/sync-prod-to-*-neon.sh` use `SSH_KEY` env var (defaults to `~/.ssh/id_ed25519`).

## Firewall & intrusion prevention (both servers)
- **UFW active**: default deny incoming, allow outgoing. Only 22/80/443 open publicly. PM2 ports (3000/3001/3002/4000) and Postgres (5432) are bound to 0.0.0.0 but firewall-blocked from outside.
- **fail2ban active**: `/etc/fail2ban/jail.d/sshd-local.conf` — sshd jail, maxretry=5, findtime=10m, bantime=1h, backend=systemd.
- **CUPS disabled** on backend (was exposed on 0.0.0.0:631): `snap stop --disable cups`.
- User's known SSH source IPs (do NOT lock out): 46.210.218.181, 141.226.89.32.

## Database backups — CRITICAL (do not break)
- **Unified script**: `/usr/local/bin/tenant_backup.sh` on backend server (mode 700). Usage: `tenant_backup.sh <tenant-key> <tenant-dir> [retention-days]`
  - Parses .env via `grep` (NEVER `source` it — Hebrew values and parens like `FIRM_DISPLAY_NAME=ליאב מלמד (MelamedLaw)` break shell parsing)
  - Dumps via `sudo -u postgres pg_dump -Fc` (peer auth, no DB password needed)
  - Writes dump to `/tmp/` first then `mv` to `/var/backups/<tenant>/` (postgres user can't write to root-owned dirs)
  - Verifies with `pg_restore -l` before upload
  - Uploads to `s3://<S3_BUCKET>/db-backups/<tenant>/<tenant>_<TS>.dump` using snap `aws` CLI
  - Local retention: 14 days
- **Cron**: `/etc/cron.d/melamedia-tenant-backups` — staggered 02:10 / 02:25 / 02:40 (snap aws CLI is memory-heavy; concurrent runs OOM)
- **Logs**: `/var/log/backups/<tenant>.log`
- **DO NOT use the legacy scripts**: `melamedlaw_pg_backup.sh`, `<tenant>/backend/scripts/backup-db-to-r2.sh` — these were broken (sourced .env and crashed on Hebrew / unquoted parens). Root crontab is now empty; only `/etc/cron.d/melamedia-tenant-backups` runs backups.
- R2 buckets: `melamedlaw-files`, `morlevy-files`, `ashrafessa-files` (creds in each tenant's `backend/.env` as `S3_*`)
- BarberBooking does not have a PG backup yet.

## Conventions
- Language in code: English. UI strings: Hebrew (via i18next)
- No ORM — raw SQL with parameterized queries (prevent SQL injection)
- JWT stored in localStorage on frontend
- Feature flags in `frontend/src/featureFlags.js`
- ISO 27001/27701/22301 compliance alignment
