# API E2E Harness (Phase B)

Runs a small, reproducible API-first E2E suite against the local backend.

## Prerequisites

- Node.js 18+ (uses built-in `fetch`)
- Backend + DB running and reachable
  - Example: backend at `http://localhost:5000`

## Environment variables

Set these **as environment variables** (recommended) or via a local file `scripts/e2e/.env` (NOT committed; `.gitignore` already excludes `.env`).

Required:

- `E2E_API_BASE_URL` (example: `http://localhost:5000/api`)
- `E2E_ADMIN_PHONE`
- `E2E_ADMIN_OTP`
- `E2E_USER_PHONE`
- `E2E_USER_OTP`

Optional:

- `E2E_TIMEOUT_MS` (default: `10000`)
- `E2E_OUT_DIR` (default: `scripts/e2e/out`)

## One-command run

From repo root:

- `npm run e2e:api`

This will:

- Generate one run prefix: `e2e-YYYYMMDD-HHMM-` (generated once per run)
- Acquire admin + user JWTs via OTP
- Run checks sequentially
- Write evidence outputs to `scripts/e2e/out/<runPrefix>/`
- Print a compact PASS/FAIL summary and exit non-zero if any FAIL

## Output & evidence

Outputs are written under:

- `scripts/e2e/out/<runPrefix>/summary.json`
- `scripts/e2e/out/<runPrefix>/<check>.json`

Evidence is best-effort sanitized:

- JWTs are never stored
- Emails / phones are masked where detected

## Token helper

Print an access token to stdout:

- Admin: `node scripts/e2e/token.mjs admin`
- User: `node scripts/e2e/token.mjs user`

Note: printing a JWT is inherently sensitive; avoid pasting it into logs/issues.
