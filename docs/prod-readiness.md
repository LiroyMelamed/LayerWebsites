# Production Readiness (Backend + Frontend)

Date: 2025-12-30

This document maps how to run the system in production, what configuration is required, and the minimal pre-production checks + rollback guidance.

---

## 1) System map

### Backend
- Runtime: Node.js (Express)
- Entrypoint: backend/server.js (imports the Express app from backend/app.js)
- Default port: 5000 (controlled by `PORT`)
- Health endpoint: `GET /health` → `{ "ok": true }`
- API base path: `/api/*`

Reverse proxy expectation (recommended)
- Put Nginx (or equivalent) in front of Node.
- Terminate TLS at the proxy.
- Forward requests to `http://127.0.0.1:<PORT>`.
- If the proxy sets `X-Forwarded-For`, enable `TRUST_PROXY=true`.

### Frontend
- Runtime: React (CRA) – static build output
- Build command: `npm --prefix frontend run build`
- Output: `frontend/build/` (static files)
- Hosting model: static hosting behind Nginx / Azure Static Web Apps / any CDN

---

## 2) Required environment variables

### Backend (production)

Core
- `PORT` — listening port (example: `5000`)
- `NODE_ENV` — recommended: `production`
- `IS_PRODUCTION` — `true` in production (affects CORS allowlist + SMS behavior)
- `TRUST_PROXY` — `true` if behind a reverse proxy that sets `X-Forwarded-*`

Auth
- `JWT_SECRET` — secret used to sign/verify JWTs (must be long and random)

Database (Postgres)
- `DB_HOST`
- `DB_PORT` (default: `5432`)
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_SSL` — `true` to enable TLS to DB (uses `rejectUnauthorized:false`)

Rate limiting (anti-flood)
- `RATE_LIMIT_IP_WINDOW_MS`
- `RATE_LIMIT_IP_MAX`
- `RATE_LIMIT_AUTH_IP_WINDOW_MS`
- `RATE_LIMIT_AUTH_IP_MAX`
- `RATE_LIMIT_USER_WINDOW_MS`
- `RATE_LIMIT_USER_MAX`

Object storage (Signing files / uploads)
- `S3_ENDPOINT`
- `S3_BUCKET`
- `S3_KEY`
- `S3_SECRET`

Uploads / signing limits + timeouts
- `API_JSON_LIMIT`
- `API_URLENCODED_LIMIT`
- `API_REQUEST_TIMEOUT_MS`
- `SERVER_REQUEST_TIMEOUT_MS`
- `SERVER_HEADERS_TIMEOUT_MS`
- `SERVER_KEEPALIVE_TIMEOUT_MS`
- `MAX_SIGNING_PDF_BYTES`
- `MAX_SIGNATURE_IMAGE_BYTES`
- `SIGNING_PDF_OP_TIMEOUT_MS`
- `SIGNING_DEBUG_LOGS`

See details + Nginx alignment guidance:
- `docs/uploads-signing-production.md`

SMS provider (OTP / notifications)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`

### Frontend (production)

Current state
- Frontend API base is configured via `REACT_APP_API_BASE_URL` (CRA build-time env).
- Ensure the production build sets it to your public API base (example: `https://api.example.com/api`).

---

## 3) Database engine + schema notes

- Engine: Postgres (`pg`), configured in `backend/config/db.js`.
- The backend expects existing tables for:
  - cases / case types / customers
  - notifications
  - signing flow: signing files + signature spots

Migrations
- SQL migration files are stored under `backend/migrations/`.
- Phase 3 will add: (a) a clear migration run order, (b) schema validation checks, and (c) backfill steps where required.

---

## 4) Pre-production checklist (minimum)

Backend
- Tests pass: `npm --prefix backend test`
- Server starts cleanly: `npm --prefix backend start`
- Health endpoint returns ok: `GET /health`
- DB connectivity ok (startup log + functional API calls)
- Rate limiting does not block normal flows (login + typical browsing)

Frontend
- Build passes: `npm --prefix frontend run build`
- App loads over HTTPS with correct API base URL (Phase 2)
- RTL layout: no regressions in critical screens

E2E harness (API-first)
- Run the harness and keep evidence: `npm run e2e:api`

---

## 5) Rollback guidance

Code rollback
- Keep the previous build artifact for frontend (static `build/`) and the previous backend release.
- Roll back by redeploying the previous artifact + restarting the backend service.

DB rollback (principle)
- Prefer reversible migrations when possible.
- If a migration is not trivially reversible (e.g., dropping columns), treat it as a one-way change:
  - restore from DB snapshot/backup, or
  - perform a forward-fix migration.

Phase 3 will add concrete rollback steps per migration and a validation script to confirm schema compatibility.
