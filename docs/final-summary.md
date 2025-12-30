# Project QA + Hardening Summary

Date: 2025-12-30

This document is the final snapshot of what was completed in UI QA/styling phases (C/D/E/F) and backend hardening batches, plus what still remains to manually verify.

---

## Key commits by phase

### Phase C — Styling foundation + rem/logical props
- aa7cc8b — Phase C: add shared SCSS foundation + globals
- be161b7 — Phase C: rem + logical spacing for admin list screens
- 9b7c685 — Phase C: rem + logical positioning for login screens
- a40ea3f — Phase C: RTL-friendly logical props in navbars
- e79e43d — Phase C: rem migration for admin/client cards

### Phase D — Inline layout styles sweep (move to SCSS)
- 5b2d511 — Phase D: base simple components (SCSS, minimal inline styles)
- cabae44 — Phase D: inputs (SimpleInput/TextArea SCSS)
- 2fe77ff — Phase D: search hover dropdown (SCSS, dynamic position vars)
- b9e8d7c — Phase D: navbars (small toolbar + nav)
- f835776 — Phase D: case list cards + DefaultState (SCSS)
- a551a95 — Phase D: client screens layout (SCSS)
- 356a12d — Phase D: sign-files dynamic styles (no literals)
- 6a64a33 — Docs: Phase D complete note

### Phase E — RTL correctness (remove row-reverse hack)
- 92d94e5 — Phase E: enforce RTL dir at root
- 56abac3 — Phase E: logical props in SCSS
- 739b301 — Phase E: remove row-reverse RTL hack (Notifications)
- 09bdfaa — Phase E: remove row-reverse RTL hack (Cases)
- 2b5eb1e — Phase E: remove row-reverse RTL hack (signFiles)
- 938b0da — Phase D/E: remove inline row-reverse in menu items (SCSS + JSX reorder)

### Phase F — Row layout standardization + overflow audit
- 7997b00 — Phase F: standard row layout + apply to filters
- c51013d — Phase F: standardize popup rows
- ad7f2ea — Phase F: normalize CaseMenuItemOpen rows
- 0d7dfd1 — Phase F+: polish SimpleTable states and spacing
- a2bce17 — Phase F: overflow audit - make SimpleTable scrollable
- 17fa76e — Docs: Phase F completion + overflow audit
- f27bec6 — UI: Phase F follow-ups (SCSS cleanup / overflow fixes)
- f37d348 — UI: prevent filter row horizontal clipping
- f1845c2 — UI: make signing modal responsive (no overflow)

---

## Backend hardening batches (anti-abuse + authz + caching + pagination)

- 26f5c4c — Docs: backend hardening plan
- b282c4d — Backend: add rate limiting (per IP + per user)
- 12194f5 — Backend: validate adminId params
- e67f8a6 — Hardening: strict numeric param validation (shared helper)
- fd091a2 — Hardening: safe in-memory caching (CaseTypes + dashboard)
- 6c61b9e — Hardening: rate limit headers + error shape + logs
- 685a78d — Batch 4: enforce authz + admin-only customers
- ac26d31 — Batch 4: tighten authz + standardize 403 shape
- 59864b7 — Tests: block cross-user signing file access
- 8da2e1a — Batch 5: rate limiter abuse hardening
- 01236c1 — Batch 6: optional pagination for lists
- 737e82b — Tests: integration coverage for pagination (cases list)

---

## What was fixed (high-level)

### Backend
- Consistent numeric `:id` validation returning `400` (prevents `500` on malformed params)
- Consistent auth failure JSON shape and rate-limit JSON shape + `Retry-After`
- Conservative in-memory caching with TTL + invalidation + scoping tests
- Authorization hardening: clear `403` (with `code: FORBIDDEN`) vs `404` vs `400` across high-risk ID endpoints
- Cross-user access blocked with integration tests (cases/case types/customers + signing files)
- Optional pagination (`limit`/`offset`) added to selected list endpoints + integration test for cases list contract

### Frontend
- Styling foundation + rem migration + logical properties for RTL-safe layout
- Removed JSX inline style literals in favor of SCSS (keeping only truly dynamic runtime `style={object}`)
- Removed RTL `row-reverse` hacks and replaced with RTL-safe structure/logical spacing
- Standardized “row” wrappers using shared mixin/utilities (gap-based, wrap-friendly)
- Overflow handling:
  - SimpleTable intentionally scrolls horizontally instead of clipping
  - Filter/search rows no longer rely on row-level `overflow: hidden`
  - Signing modal grid is overflow-safe and stacks on narrow screens

### QA documentation
- Phase B API-first e2e evidence recorded and repeatable via harness
- Manual QA checklist added for the final overflow/RTL gate

---

## What remains (explicit)

### Manual QA gate (still required)
- Run the manual narrow-width pass to confirm **no horizontal scrollbars/clipping** on:
  - MainScreen
  - CaseFullView
  - SigningScreen / SigningManagerScreen / UploadFileForSigningScreen
  - NotificationsScreen

Use the dedicated checklist:
- docs/manual-qa-checklist.md

### Backend follow-ups (planned, not required for this close)
- Optional: verify/add indexes for hot paths (see docs/backend-hardening-plan.md)
- Optional: expand pagination to any remaining high-cardinality list endpoints
- Optional: consider Redis for multi-instance scaling (cache + rate limiting)

### Product flow completeness
- Signing “full upload/detect/sign” flow is still marked TODO for true E2E validation (Phase B notes).

---

## Exact commands to verify

All commands run from repo root.

### Frontend build
```bash
npm --prefix frontend run build
```

### Backend test suite
```bash
npm --prefix backend test
```

### API E2E harness (Phase B)
Prereqs:
- Backend must be running and reachable (default `http://localhost:5000`)
- Postgres configured (see backend/config/db.js)
- OTP credentials provided via env vars or scripts/e2e/.env (not committed)

Run:
```bash
npm run e2e:api
```

Evidence output:
- scripts/e2e/out/<runPrefix>/summary.json
- scripts/e2e/out/<runPrefix>/*.json

---

## References
- docs/audit-report.md
- docs/backend-hardening-plan.md
- docs/e2e-checklist.md
- docs/manual-qa-checklist.md

---

## Unreleased UI work (working tree)

If these changes are present but not yet committed, they belong to the next UI batch:
- Add shared responsive tokens/utilities (breakpoints + fluid clamp sizing + hide-on-mobile).
- Make toolbar/login/OTP logos responsive without inline sizing props.
- Hide non-critical Email column on small screens for customers and admins.

After committing, re-run:
```bash
npm --prefix frontend run build
```
