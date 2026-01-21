# Deploy to production (Ubuntu + Postgres + PM2 + Nginx)

Date: 2026-01-17

This is a step-by-step manual deployment guide (SSH) for:
- Backend: Node.js/Express managed by PM2
- DB: Postgres (local or managed) accessed via `DATABASE_URL`
- Frontend: React static build served by Nginx

---

## 0) Assumptions

- You have an Ubuntu server with SSH access.
- You have a working Postgres `DATABASE_URL` for production.
- Nginx is installed and will serve:
  - frontend static files
  - reverse-proxy `/api/*` to the backend

Suggested filesystem layout
- Production (current): `/root/LayerWebsites/`
  - `backend/`
  - `frontend/`
- Alternative: `/var/www/melamedlaw/`
  - `backend/`
  - `frontend/`

---

## 1) Backend deploy (PM2)

### 1.1 Install runtime deps
```bash
sudo apt-get update
sudo apt-get install -y curl ca-certificates git

# Node.js (example using NodeSource; pin to an LTS version you support)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2
sudo npm i -g pm2
```

### 1.2 Upload code
From your machine:
- `git pull` on the server, or
- upload a tarball/zip and extract under `/var/www/melamedlaw/backend`

Example (current production layout):
```bash
cd /root/LayerWebsites
git pull
```

### 1.3 Install dependencies
```bash
cd /root/LayerWebsites/backend
npm ci
```

### 1.4 Configure env vars (NO secrets in git)
We deploy a `backend/.env` file on the server (NOT committed).

Create it from the template:
```bash
cd /root/LayerWebsites/backend
cp .env.production.example .env
nano .env

# protect secrets
chmod 600 .env
```

Notes:
- `backend/ecosystem.config.js` is configured with `env_file: '.env'`.
- Keep Nginx and backend upload/timeouts aligned.
 - When running scripts manually (migrations/verify), you must load the env vars (see migrations section below).

Template:
- `backend/.env.production.example`

Uploads/signing limits you must set/confirm (keep aligned with Nginx):
- `API_JSON_LIMIT`, `API_URLENCODED_LIMIT`
- `SERVER_REQUEST_TIMEOUT_MS`, `SERVER_HEADERS_TIMEOUT_MS`, `SERVER_KEEPALIVE_TIMEOUT_MS`
- `MAX_SIGNING_PDF_BYTES`, `MAX_SIGNATURE_IMAGE_BYTES`, `SIGNING_PDF_OP_TIMEOUT_MS`

See:
- `docs/uploads-signing-production.md`

### 1.5 Logs directory
```bash
sudo mkdir -p /var/log/melamedlaw-api
sudo chown -R $USER:$USER /var/log/melamedlaw-api
```

### 1.6 PM2 start
Use the committed ecosystem file:
- `backend/ecosystem.config.js`

Commands:
```bash
cd /root/LayerWebsites/backend
pm2 start ecosystem.config.js --env production --update-env
pm2 status
```

Important:
- The PM2 process name may differ per server (example seen in production: `melamed-backend`).
- Always run `pm2 status` and use the name shown there for restarts.

### 1.7 PM2 startup (boot on reboot)
```bash
pm2 startup
# follow the printed command (usually needs sudo)
pm2 save
```

### 1.8 Safe restart / zero downtime
Fork mode (default here):
- `pm2 restart <pm2-app-name> --update-env`

Example (current production):
```bash
pm2 restart melamed-backend --update-env
```

When you change `backend/.env`, always restart with `--update-env`.

If you later switch to cluster mode:
- `pm2 reload <pm2-app-name> --update-env` (zero-downtime reload)

---

## 2) Database migrations

Run migrations before starting traffic.

### 2.1 Apply migrations
```bash
cd /root/LayerWebsites/backend
bash migrations/migration-run.sh
```

### 2.2 Verify migrations (requires DATABASE_URL)
If `psql "$DATABASE_URL" ...` fails with `role "root" does not exist`, it usually means `DATABASE_URL` is not set in your current shell (so `psql` falls back to local socket + OS user).

Load the backend env first, then verify:
```bash
cd /root/LayerWebsites/backend

# quick sanity
echo "DATABASE_URL=$DATABASE_URL"

# load env for this shell (so psql uses the correct URL)
set -a
source .env
set +a

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/migration-verify.sql
```

See:
- docs/db-migrations.md

---

## 3) Frontend deploy (Nginx)

### 3.1 Build
```bash
cd /root/LayerWebsites/frontend
npm ci

# IMPORTANT: set REACT_APP_API_BASE_URL to production API base
# example: https://api.calls.melamedlaw.co.il/api
npm run build
```

### 3.2 Publish static build
Serve `frontend/build/` via Nginx.

---

## 4) Nginx notes (reverse proxy + uploads)

Recommended baseline:
- Reverse proxy `/api/` to `http://127.0.0.1:5000`
- Serve frontend from `frontend/build/`

Uploads/timeouts:
- Set `client_max_body_size` high enough for your expected signing PDFs.
- Set `proxy_read_timeout` / `proxy_send_timeout` to tolerate large PDF operations.

See:
- docs/uploads-signing-production.md

---

## 5) Verify after deploy

Backend
- `curl -sS http://127.0.0.1:5000/health`

Frontend
- Open the site in browser over HTTPS.

Full smoke checklist
- docs/prod-smoke-checklist.md
- docs/production-go-live-checklist.md
