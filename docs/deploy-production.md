# Deploy to production (Ubuntu + Postgres local + PM2 + Nginx)

Date: 2025-12-30

This is a step-by-step manual deployment guide (SSH) for:
- Backend: Node.js/Express managed by PM2
- DB: Postgres on the same server
- Frontend: React static build served by Nginx

---

## 0) Assumptions

- You have an Ubuntu server with SSH access.
- Postgres is installed locally on the server.
- Nginx is installed and will serve:
  - frontend static files
  - reverse-proxy `/api/*` to the backend

Suggested filesystem layout
- `/var/www/melamedlaw/`
  - `backend/`
  - `frontend/` (or just `frontend/build/`)

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

### 1.3 Install dependencies
```bash
cd /var/www/melamedlaw/backend
npm ci
```

### 1.4 Configure env vars (NO secrets in git)
Recommended approach:
- Create a root-owned env file:
  - `/etc/melamedlaw/backend.env` (chmod 600)
- Export variables from it in the service shell, or use PM2 ecosystem env placeholders and `--update-env`.

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
cd /var/www/melamedlaw/backend
pm2 start ecosystem.config.js --env production --update-env
pm2 status
```

### 1.7 PM2 startup (boot on reboot)
```bash
pm2 startup
# follow the printed command (usually needs sudo)
pm2 save
```

### 1.8 Safe restart / zero downtime
Fork mode (default here):
- `pm2 restart melamedlaw-api --update-env`

If you later switch to cluster mode:
- `pm2 reload melamedlaw-api --update-env` (zero-downtime reload)

---

## 2) Database migrations

Run migrations before starting traffic.

See:
- docs/db-migrations.md

---

## 3) Frontend deploy (Nginx)

### 3.1 Build
```bash
cd /var/www/melamedlaw/frontend
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
