# Plan/Limits Expansion — Phase 0 Discovery Report

Date: 2026-01-16

## Scope (what this report covers)
This report inventories the current tenancy model and the data/flows that drive operational costs (storage, evidence CPU, OTP/SMS, and team users). It is intentionally discovery-only: no schema/code changes are proposed here beyond identifying where they would hook.

## Executive summary
- **Current “tenant” in plans/billing is a single user**: `tenant_subscriptions.tenant_id` is a `users.userid`, and the app derives it from `signingfiles.lawyerid`.
- The app behaves like **one deployment for one firm**, but the database has **no first-class firm/office identifier** beyond a free-form `companyname` string.
- Several cost drivers can be metered from existing tables today (documents and OTP). Others (storage bytes, evidence CPU) are only partially observable without additional metadata.

## Tenancy model (as implemented today)
### Identifiers in play
- **User identity**: `users.userid`.
- **Role**: `users.role` and JWT `decoded.role`.
- **“Tenant” for billing/retention**: `tenant_subscriptions.tenant_id` = `users.userid` (migration comment explicitly states tenant is derived from `signingfiles.lawyerid`).

### Where “tenant” is taken from in code
- Requests authenticate into `req.user = { UserId, Role, PhoneNumber }` via JWT in [backend/middlewares/authMiddleware.js](../../backend/middlewares/authMiddleware.js).
- Billing endpoints use `tenantId = req.user.UserId`:
  - [backend/controllers/billingController.js](../../backend/controllers/billingController.js)
  - [backend/routes/billingRoutes.js](../../backend/routes/billingRoutes.js)
- Signing workflows treat the owning “tenant/lawyer” as `signingfiles.lawyerid`.
- Retention cleanup discovers tenants from `tenant_subscriptions` and falls back to any `signingfiles.lawyerid`:
  - [backend/scripts/retentionCleanup.js](../../backend/scripts/retentionCleanup.js)

### Deployment/domain distinction (single deployment oriented)
- CORS allowlist is static by env (production vs stage) in [backend/app.js](../../backend/app.js).
- SMS text and links use a fixed `WEBSITE_DOMAIN` constant (with env override patterns elsewhere):
  - [backend/utils/sendMessage.js](../../backend/utils/sendMessage.js)

**Implication:** the system does not currently route or partition by host/domain to select a firm/tenant; it assumes the deployment already corresponds to a single customer context.

## Schema inventory relevant to tenancy + cost drivers
### Core “people” and ownership
- `users` (PK `userid`): includes `role` and free-form `companyname`.
  - Source-of-truth dump: [backend/melamedlaw.sql](../../backend/melamedlaw.sql)
- `cases` (PK `caseid`): owned by a customer `userid`; also stores `companyname` and optional `casemanagerid`.
  - [backend/melamedlaw.sql](../../backend/melamedlaw.sql)

### Signing + evidence tables
- `signingfiles` (PK `signingfileid`): key ownership fields:
  - `lawyerid` (current billing tenant)
  - `clientid` (optional)
  - retention + legal-hold fields; storage keys for original/signed PDF
  - [backend/melamedlaw.sql](../../backend/melamedlaw.sql)
- `signaturespots` (PK `signaturespotid`): belongs to `signingfileid`; includes `signeruserid` and storage metadata for signature images.
  - [backend/melamedlaw.sql](../../backend/melamedlaw.sql)
- `audit_events` (UUID PK `eventid`): append-only audit log with `signingfileid`, `actor_userid`, `event_type`, IP/UA, etc.
  - [backend/melamedlaw.sql](../../backend/melamedlaw.sql)
- `signing_otp_challenges` (UUID PK `challengeid`): OTP records per signing session.
  - [backend/melamedlaw.sql](../../backend/melamedlaw.sql)
- `signing_consents` (UUID PK `consentid`): consent records per signing session.
  - [backend/melamedlaw.sql](../../backend/melamedlaw.sql)

### Plans / billing / retention tables (created via migrations)
- `subscription_plans` (PK `plan_key`): platform-owned plan definitions.
  - Created/seeded in [backend/migrations/2026-01-16_00_subscription_plans_and_retention_runs.sql](../../backend/migrations/2026-01-16_00_subscription_plans_and_retention_runs.sql)
- `tenant_subscriptions` (PK `tenant_id`): plan assignment for a “tenant” (currently a `users.userid`).
  - Created in [backend/migrations/2026-01-16_00_subscription_plans_and_retention_runs.sql](../../backend/migrations/2026-01-16_00_subscription_plans_and_retention_runs.sql)
- `data_retention_runs`: retention run logging.
  - Created in [backend/migrations/2026-01-16_00_subscription_plans_and_retention_runs.sql](../../backend/migrations/2026-01-16_00_subscription_plans_and_retention_runs.sql)
- `signing_retention_warnings`: placeholder scheduling table.
  - Created in [backend/migrations/2026-01-16_02_plans_limits_v2_and_retention_markers.sql](../../backend/migrations/2026-01-16_02_plans_limits_v2_and_retention_markers.sql)

## Current metering capability by cost driver
### 1) Documents / signing activity
- **Observable today** via `signingfiles` counts.
- Implemented usage endpoint returns monthly counts:
  - [backend/lib/limits/getUsageForTenant.js](../../backend/lib/limits/getUsageForTenant.js)

### 2) OTP / messaging cost
Two separate OTP concepts exist:
- **Login OTPs** in `otps` (used by auth flows).
  - Table exists in [backend/melamedlaw.sql](../../backend/melamedlaw.sql)
- **Signing OTPs** in `signing_otp_challenges` (used for evidence strength).
  - Records exist per challenge and include timestamps and verification outcomes.
  - Creation code stores a DB row then sends SMS:
    - [backend/controllers/signingFileController.js](../../backend/controllers/signingFileController.js)

Notes:
- `provider_message_id` exists on `signing_otp_challenges`, but the SMS sender currently does **not** return/provider-capture message IDs.
  - Sender: [backend/utils/sendMessage.js](../../backend/utils/sendMessage.js)

### 3) Storage cost (bytes)
Storage is split across two patterns:
- **Signing artifacts** stored in object storage with keys persisted on `signingfiles` and `signaturespots`.
  - `signingfiles` has storage bucket/key/etag/versionId for original/signed PDFs.
  - `signaturespots` stores signature image metadata.
- **Generic uploads**: presigned uploads under `users/<userId>/...` with an ownership prefix check.
  - [backend/controllers/filesController.js](../../backend/controllers/filesController.js)

Gaps:
- The DB does **not** persist object sizes for signing PDFs or signature images (sizes are sometimes derived at runtime via `HeadObject`).
- `uploadedfiles` (case attachments) stores only `filepath` and `uploaddate` and does not record size.

### 4) Evidence CPU / heavy operations
Evidence-related operations:
- Evidence ZIP and evidence certificate generation occur in [backend/controllers/signingFileController.js](../../backend/controllers/signingFileController.js).
- Downloads write audit events (example: `EVIDENCE_PACKAGE_DOWNLOADED`).

Observable today:
- **Counts** can be approximated using `audit_events.event_type`.
- **CPU time** is not recorded.

### 5) Team users (multi-lawyer + admins)
- Users live in `users` with a `role` string.
- Admin management exists in [backend/controllers/adminController.js](../../backend/controllers/adminController.js).

Gaps:
- There is no durable entity representing “firm/office” and no membership mapping, so “team users per firm” cannot be enforced without introducing a firm identifier.

## Key finding: firm model is not yet first-class
### What exists today
- `users.companyname` and `cases.companyname` are free-form strings used for display/search.

### What is missing
- A `firms`/`offices` table.
- A `firm_id` foreign key on `users` and/or on legal artifacts.
- A firm-scoped subscription table.

## Open questions (to resolve before implementation)
1. Should the system remain **strictly single-firm per deployment** (firm_id constant), or do we want the schema to support multiple firms in one DB instance?
2. Should billing/limits be scoped to:
   - (A) **lawyer user** (current behavior),
   - (B) **firm**, or
   - (C) both (firm default with per-user overrides)?
3. For storage metering, do we want accuracy or simplicity?
   - Accurate: store object sizes at write time.
   - Simple: estimate via periodic HEAD sampling (higher operational cost).
4. Should OTP quotas include **login OTP**, **signing OTP**, or both?

## Appendix: primary files touched in discovery
- [backend/melamedlaw.sql](../../backend/melamedlaw.sql)
- [backend/migrations/2026-01-16_00_subscription_plans_and_retention_runs.sql](../../backend/migrations/2026-01-16_00_subscription_plans_and_retention_runs.sql)
- [backend/migrations/2026-01-16_02_plans_limits_v2_and_retention_markers.sql](../../backend/migrations/2026-01-16_02_plans_limits_v2_and_retention_markers.sql)
- [backend/middlewares/authMiddleware.js](../../backend/middlewares/authMiddleware.js)
- [backend/controllers/billingController.js](../../backend/controllers/billingController.js)
- [backend/lib/plan/resolveTenantPlan.js](../../backend/lib/plan/resolveTenantPlan.js)
- [backend/lib/limits/getUsageForTenant.js](../../backend/lib/limits/getUsageForTenant.js)
- [backend/controllers/signingFileController.js](../../backend/controllers/signingFileController.js)
- [backend/utils/sendMessage.js](../../backend/utils/sendMessage.js)
- [backend/controllers/filesController.js](../../backend/controllers/filesController.js)
