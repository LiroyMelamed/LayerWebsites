# Production go-live checklist (final gate)

Goal: final checklist before opening real traffic.

## 1) Backups
- Confirm an up-to-date backup exists (and you know where it is stored).
- Confirm restore steps are understood (pg_restore or full VM snapshot as applicable).

## 2) Database migrations
- Run migrations:
  - `bash /var/www/melamedlaw/backend/migrations/migration-run.sh`
- Verify schema:
  - `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /var/www/melamedlaw/backend/migrations/migration-verify.sql`

## 3) Process + proxy health
- `pm2 status`
- `pm2 logs melamedlaw-api --lines 200`
- `sudo systemctl status nginx --no-pager`
- `sudo nginx -t`
- `curl -sS http://127.0.0.1:5000/health`

## 4) Nginx settings (uploads/timeouts)
- Confirm `client_max_body_size` matches Express `API_JSON_LIMIT`.
- Confirm proxy timeouts (`proxy_read_timeout`, etc.) are >= backend timeouts.
- See: `docs/uploads-signing-production.md`

## 5) Frontend build correctness
- Confirm production build points at the correct API:
  - `REACT_APP_API_BASE_URL` is set during `npm run build`

## 6) Security & logging hygiene
- No secrets in git or environment files committed.
- Logs do not print phone numbers, OTPs, tokens, JWTs, or full object keys.
- Rate limiting is enabled and returns consistent JSON errors.

## 7) Final smoke
- Run through `docs/prod-smoke-checklist.md`.
- If anything fails, stop and rollback (restore backup + deploy previous release).
