# Compliance & ISO Readiness

This document describes MelamedLaw's compliance posture, how the ISO-related
feature flags work, and how to safely transition from **aligned** to **certified**
mode once formal certification is achieved.

---

## Standards Covered

| Standard | Scope | Current Status |
|---|---|---|
| **ISO/IEC 27001** | Information Security Management System (ISMS) | Aligned |
| **ISO/IEC 27701** | Privacy Information Management System (PIMS) | Ready |
| **ISO 22301** | Business Continuity Management System (BCMS) | Based on |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  Environment variable                        │
│  COMPLIANCE_BADGES_MODE = aligned | certified│
└────────────┬────────────────────────────────┘
             │
     ┌───────▼────────┐
     │  Backend        │
     │  config/        │
     │  compliance.js  │  ← single source of truth
     └───────┬────────┘
             │
  GET /api/compliance/status
             │
     ┌───────▼─────────────────┐
     │  Web Frontend            │
     │  <ComplianceBadges />    │  ← adapts labels per mode
     │  /security              │
     │  /privacy               │
     │  /continuity            │
     │  /compliance            │
     └───────┬─────────────────┘
             │
     ┌───────▼─────────────────┐
     │  Mobile App              │
     │  ComplianceScreen        │  ← fetches from API
     │  Accessible from Profile │
     └─────────────────────────┘
```

---

## Environment Variables

| Variable | Values | Default | Description |
|---|---|---|---|
| `COMPLIANCE_BADGES_MODE` | `aligned` \| `certified` | `aligned` | Controls badge labels throughout the entire stack |

### Setting the variable

**Local development (.env)**
```
COMPLIANCE_BADGES_MODE=aligned
```

**Production (PM2 ecosystem.config.js)**
```js
env: {
    COMPLIANCE_BADGES_MODE: 'aligned',
}
```

---

## Feature Flag Behaviour

| Mode | ISO 27001 Label | ISO 27701 Label | ISO 22301 Label |
|---|---|---|---|
| `aligned` | Aligned with ISO/IEC 27001 controls | ISO/IEC 27701-ready | Business continuity principles based on ISO 22301 |
| `certified` | ISO/IEC 27001 Certified | ISO/IEC 27701 Certified | ISO 22301 Certified |

The backend's `GET /api/compliance/status` endpoint returns:

```json
{
    "mode": "aligned",
    "standards": {
        "iso27001": { "name": "ISO/IEC 27001", "scope": "...", "status": "aligned", "label": "..." },
        "iso27701": { "name": "ISO/IEC 27701", "scope": "...", "status": "ready",   "label": "..." },
        "iso22301": { "name": "ISO 22301",     "scope": "...", "status": "based",   "label": "..." }
    },
    "disclaimer": "Compliance program in progress..."
}
```

---

## How to Safely Change from Aligned → Certified

> **⚠ LEGAL WARNING**: Only set `COMPLIANCE_BADGES_MODE=certified` after your
> organisation has obtained the relevant certifications from an accredited
> registrar and can evidence valid certificates. False certification claims
> can constitute a legal liability.

### Steps

1. **Obtain certification** from an accredited ISO registrar.
2. **Store certificate copies** securely (digital + physical).
3. **Update the environment variable**:
   ```bash
   # In production .env or PM2 config
   COMPLIANCE_BADGES_MODE=certified
   ```
4. **Restart the backend**:
   ```bash
   pm2 restart melamedlaw-api
   ```
5. **Verify** by visiting `/compliance` on the web frontend — badges should
   now read "Certified".
6. **Rebuild the mobile app** (Expo/EAS) so the compliance screen fetches
   the updated status.

---

## What Is Implemented

### Backend (ISO 27001 controls)

| Control | Implementation | File |
|---|---|---|
| A.5.1 – Security policies | Compliance config & status endpoint | `config/compliance.js`, `routes/complianceRoutes.js` |
| A.8.9 – Web filtering | Helmet security headers (HSTS, X-Frame-Options, etc.) | `app.js` |
| A.8.15 – Logging | Security audit logger (JSONL, daily rotation, 90-day retention) | `utils/securityAuditLogger.js` |
| A.8.16 – Monitoring | Rate limiting, brute-force lockout | `utils/rateLimiter.js`, `utils/otpBruteForce.js` |
| A.8.24 – Cryptography | JWT HS256 with algorithms whitelist, OTP HMAC-SHA256 hashing | `controllers/authController.js` |
| A.5.24–A.5.26 – Incident mgmt | Incident logging stub | `utils/incidentLogger.js` |

### Frontend

| Feature | Files |
|---|---|
| Reusable `<ComplianceBadges />` component | `components/compliance/ComplianceBadges.js` |
| Public pages: `/security`, `/privacy`, `/continuity`, `/compliance` | `screens/compliance/*.js` |
| Badges in sidebar, mobile drawer, login screen | `TopAndRightNavBar.js`, `TopToolBarSmallScreen.js`, `TopCenteredLogo.js` |
| i18n support (Hebrew, English, Arabic) | `i18n/locales/*.json` → `compliance.*` keys |

### Mobile App

| Feature | Files |
|---|---|
| ComplianceScreen (linked from Profile) | `screens/ComplianceScreen.js` |
| Stack navigator registration | `App.js` |
| Profile navigation button | `screens/ProfileScreen.js` |

---

## Legal Disclaimer

The compliance information displayed in the application is for informational
purposes only and does not constitute legal advice.  The compliance status
labels are driven by the `COMPLIANCE_BADGES_MODE` environment variable set by
the system administrator.  The organisation must ensure that the selected mode
accurately reflects its current certification status.

**Never hardcode "certified"** in any source file. Always use the environment
flag to control this designation.

---

## Incident Logging (ISO 22301 / ISO 27001 A.5.24–A.5.26)

An incident report structure is available at `backend/utils/incidentLogger.js`.

### Usage

```js
const { createIncident, resolveIncident, Severity } = require('./utils/incidentLogger');

// Create an incident
const inc = createIncident({
    severity: Severity.HIGH,
    summary: 'Database connection pool exhausted',
    detectedBy: 'health-monitor',
});

// Later, resolve it
resolveIncident(inc.incidentId, 'Increased pool size and restarted');
```

Incidents are stored as JSON files in `backend/logs/incidents/` and also
logged to the security audit trail.

---

## Verification Commands

```bash
# Backend — start and verify compliance endpoint
cd backend
node -e "const c = require('./config/compliance'); console.log(JSON.stringify(c.getComplianceStatus(), null, 2))"

# Frontend — build
cd frontend
npx react-scripts build

# Mobile — Expo type check (if TypeScript)
cd LawyerApp
npx expo start --no-dev --minify
```
