# Plan/Limits Expansion — Migration & Implementation Plan (Additive Only)

Date: 2026-01-16

Validation checklist: docs/plan-limits/FIRM_SCOPE_SMOKE.md

Optional utility (recommended after enabling firm scope): backend/scripts/firmBackfill.js

## Goals
- Move quotas/usage from “per-lawyer user” to a **firm-scoped** model that matches: “one deployment = one law firm, multiple lawyer/admin users”.
- Expand limits to cover actual cost drivers:
  - Storage bytes
  - Evidence CPU / evidence exports
  - OTP/SMS sends
  - Team users
- Preserve current behavior for existing installations until explicitly enabled.
- Keep changes **additive**, **idempotent**, and non-destructive by default.

## Non-goals
- No breaking auth refactors (JWT stays as-is).
- No destructive migrations or forced re-partitioning.
- No strict “billing engine” or payment integration in this phase.

## Current state recap (baseline)
- `tenant_subscriptions.tenant_id` is currently a `users.userid` (derived from `signingfiles.lawyerid`).
- Usage endpoint only reports signing document counts.
- Storage and evidence CPU are not reliably measurable without additional metadata.

## Recommendation: introduce a minimal firm model (while preserving legacy tenant behavior)
### Why
- Team-user quotas only make sense at a group level.
- Storage and OTP usage is also naturally shared across a firm.
- The current `companyname` is free-form and duplicated; it’s not safe as a primary key.

### Proposed schema (additive)
1) `firms`
- `firm_id bigserial primary key`
- `name text not null`
- `created_at timestamptz not null default now()`
- Optional: `status text`, `billing_email text`, `settings jsonb`

2) `firm_users`
- `firm_id bigint not null references firms(firm_id) on delete cascade`
- `user_id int not null references users(userid) on delete cascade`
- `role_in_firm text null` (optional; distinct from app `users.role`)
- `created_at timestamptz not null default now()`
- `primary key (firm_id, user_id)`

3) Firm-scoped subscriptions
Option A (cleaner): new table
- `firm_subscriptions`
  - `firm_id bigint primary key references firms(firm_id) on delete cascade`
  - `plan_key text not null references subscription_plans(plan_key)`
  - `status text not null default 'active'`
  - `starts_at/ends_at/created_at/updated_at`

Option B (minimal churn): extend existing
- Add nullable `firm_id` to `tenant_subscriptions` and allow either `tenant_id` (legacy) or `firm_id` (new)
  - This is slightly messier (dual-mode), but minimizes code duplication.

**Preferred:** Option A, because it avoids ambiguous uniqueness and keeps “tenant_id is user” stable.

4) Firm-scoped usage rollups (optional but recommended)
- `firm_usage_events` (append-only) or `firm_usage_rollups` (periodic aggregation)

## Plan schema extensions (cost drivers)
Keep `subscription_plans` as the single source of truth. Add additive columns for explicit quotas.

Suggested columns (nullable = unlimited):
- Storage
  - `storage_bytes_quota bigint null` (more precise than GB)
- Evidence CPU / exports
  - `evidence_exports_monthly_quota int null` (ZIP + certificate counts)
  - Optional later: `evidence_cpu_seconds_monthly_quota int null`
- OTP
  - `otp_sms_monthly_quota int null` (signing OTP)
  - Optional: `login_otp_sms_monthly_quota int null`
- Team users
  - reuse `users_quota` (already exists) but redefine semantics as “active firm members”

## Metering strategy (incremental, low-risk)
### Documents (already implemented)
- Continue counting `signingfiles`.
- Switch scope from `lawyerid` to `firm_id` only after firm mapping exists.

### OTP/SMS
- Signing OTP: count rows in `signing_otp_challenges` joined through `signingfiles` to firm.
- Login OTP: count rows in `otps` joined through `users` to firm.

### Evidence exports
- Use `audit_events.event_type` counts (e.g., `EVIDENCE_PACKAGE_DOWNLOADED`, `EVIDENCE_CERTIFICATE_DOWNLOADED`) joined to firm via `signingfiles`.
- Optional improvement: add duration metrics around evidence generation and write to `audit_events.metadata` (additive; no behavior change).

### Storage bytes
Two viable paths:

A) Accurate (recommended)
- Add columns:
  - `signingfiles.original_bytes bigint null`
  - `signingfiles.signed_bytes bigint null`
  - `signaturespots.signature_image_bytes bigint null`
- Populate these at write time (upload/generate/signature image save) using known buffer lengths or object HEAD once.

B) Approximate (fallback)
- Periodic job that HEADs objects and caches sizes.
- Higher operational cost; less deterministic.

## Code changes (high level) — after migrations
### Phase 1: firm identity resolution (non-breaking)
- Add `resolveFirmForUser(userId)` helper.
  - Default behavior: if user has no firm mapping, treat firm as “user-as-firm” (compat mode).
- Update billing endpoints to report both:
  - `legacyTenantId` (userId)
  - `firmId` (resolved)

### Phase 2: move usage to firm scope (behind a flag)
- Add feature flag in `subscription_plans.feature_flags` (or env) like `billing_scope = 'firm'`.
- If flag on:
  - Plan resolution uses firm subscription.
  - Usage aggregates by firm.
- If flag off: keep current per-user behavior.

### Phase 3: enforce quotas at obvious control points
- Team users: enforce on “add admin/lawyer” endpoints.
- OTP: enforce on “send OTP” endpoints.
- Storage: enforce on file upload / PDF generation endpoints.

**Important:** enforcement should start as “warn-only” (HTTP 200 + UI warning or audit entry) before turning into hard failures.

## Backfill approach (safe and reversible)
1. Create a default firm:
   - `MelamedLaw` (or deployment name).
2. Add existing staff users (Admins/Lawyers) into that firm.
3. Optionally map customers too (if needed for cross-joins).

Avoid using `companyname` for automated grouping unless explicitly confirmed safe.

## Risks & mitigations
- Risk: incorrect firm grouping causes quota misbilling.
  - Mitigation: start with a single default firm; require explicit admin action to create additional firms.
- Risk: storage usage remains inaccurate.
  - Mitigation: store byte sizes at write time going forward; treat historical bytes as unknown until re-indexed.
- Risk: evidence CPU enforcement disrupts urgent exports.
  - Mitigation: start with “soft limits” (warnings) and add admin override.

## Deliverables checklist (implementation order)
1. Add migrations:
   - `firms`, `firm_users`, `firm_subscriptions` (or dual-mode subscription).
   - Extend `subscription_plans` with new quota columns.
   - Add size columns to `signingfiles/signaturespots` (optional but recommended).
2. Add firm resolution helper and update billing/usage queries.
3. Add metering for OTP/evidence exports and storage.
4. Add enforcement (warn-only → hard limits) behind flags.

---

This plan is intended to be the minimal additive path to firm-scoped limits, while keeping the current per-user (“tenant”) model operational until explicitly switched.
