# CLAUDE.md — Project Context for Claude Code

## Project
Legal practice management platform ("MelamedLaw") for Israeli law firm(s).
Hebrew-first UI. Domain: client.melamedlaw.co.il

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
- **MelamedLaw**: Server 37.60.230.148, path /root/LayerWebsites, branch `MelamedLaw`, PM2 `melamed-backend`, port 3000
- **MorLevi**: Same server, path /root/MorLevi, branch `MorLevi`, PM2 `morlevy-api`, port 3001
- NEVER run `pm2 restart all` — always restart specific process only
- NEVER do git operations on /root/LayerWebsites unless explicitly working on MelamedLaw
- The two deployments are COMPLETELY SEPARATE despite sharing the same GitHub repo
- Frontend build is manual — `cd frontend && npm run build`, then upload build folder

## Conventions
- Language in code: English. UI strings: Hebrew (via i18next)
- No ORM — raw SQL with parameterized queries (prevent SQL injection)
- JWT stored in localStorage on frontend
- Feature flags in `frontend/src/featureFlags.js`
- ISO 27001/27701/22301 compliance alignment
