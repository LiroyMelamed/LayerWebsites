# RUN_E2E

This repo has two E2E options:

- **API E2E harness** (existing): validates backend flows with Node fetch.
- **UI E2E (Playwright)** (added): validates signing OTP-required vs OTP-waived UX.

## Prerequisites (Windows)

- Node.js 18+
- `npm install` in the repo root
- For UI E2E: run the frontend dev server

## 1) API E2E (existing)

Runs scripts under `scripts/e2e/`.

1. Ensure backend + DB are running and reachable.
2. Configure env vars (either system env vars or `scripts/e2e/.env`). See `scripts/e2e/README.md`.
3. Run:

- `npm run e2e:api`

## 2) UI E2E (Playwright)

These tests are intentionally **self-contained**:
- They run against the frontend UI.
- They mock backend calls at the browser network layer (so you don’t need R2/Twilio for the UI suite).

What’s covered:
- Signing flow: OTP required vs OTP waived (consent + OTP gating).
- Lawyer UI: “הורד חבילת ראיות” download from the Signing Manager details popup.

Playwright is configured to use its built-in `webServer`:
- **Command**: `npm --prefix frontend start`
- **URL**: `http://localhost:3000`
- **Timeout**: 120s
- **Local dev**: `reuseExistingServer=true` (won’t restart if already running)
- **CI**: `reuseExistingServer=false` (always start/stop cleanly)

### One-time setup

From repo root:

- `npm install`
- `npx playwright install`

### Local dev flow (reuseExistingServer=true)

- If your frontend is already running on `http://localhost:3000`, Playwright will reuse it.
- If not running, Playwright will start it automatically.

### Run the UI suite

From repo root:

- `npm run e2e:ui`

Useful variants:

- Headed run: `npm run e2e:ui:headed`
- Open report: `npm run e2e:ui:report`

### Optional: custom base URL

If your frontend runs on a different URL:

- `set E2E_UI_BASE_URL=http://localhost:3001`
- `npm run e2e:ui`

### CI flow (reuseExistingServer=false)

In CI, set `CI=true` so Playwright always starts/stops a fresh frontend server:

- `set CI=true`
- `npm run e2e:ui`

### Environment variables (UI E2E)

Optional:
- `E2E_UI_BASE_URL` (defaults to `http://localhost:3000`)

Safety defaults (configured in Playwright `webServer.env`):
- `REACT_APP_API_BASE_URL=http://localhost:5000/api` (prevents accidental production/staging usage)
- `E2E=true`, `REACT_APP_E2E=true`
- `BROWSER=none`, `PORT=3000`

### Evidence Package (feature note)

In the web UI, the button appears under:
- Admin → Signing Manager → “פרטי מסמך” popup → “הורד חבילת ראיות”

The button is only visible when a signed PDF exists (`SignedFileKey` present).
