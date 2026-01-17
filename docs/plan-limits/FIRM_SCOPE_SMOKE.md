# Firm Scope (Law Firm = Tenant) — Smoke Checklist

This checklist validates the **firm-scoped Plans/Billing/Limits** path end-to-end while preserving the legacy **tenant=user** behavior when firm scope is disabled.

## 0) Preconditions

- DB migrations applied through:
  - `backend/migrations/2026-01-16_03_firm_scope_and_usage.sql`
- Backend running.
- You have:
  - a **platform admin** user id (allowlisted in prod), and
  - at least one normal lawyer user.

## 1) Environment toggles

Set these in the backend environment and restart the server.

- Enable firm scope:
  - `FIRM_SCOPE_ENABLED=true`
- Default firm identity (used to bootstrap when nothing exists yet):
  - `LAW_FIRM_KEY=default`
  - `LAW_FIRM_NAME=Default Firm`
- Limits enforcement mode:
  - `LIMITS_ENFORCEMENT_MODE=warn` (default) or `block`
- Optional “unlimited until” override for *the default firm* (first production firm ramp):
  - `FIRM_DEFAULT_UNLIMITED_UNTIL_UTC=2026-12-31T23:59:59Z`

Platform admin gating:
- `PLATFORM_ADMIN_USER_IDS=123,456` (comma-separated UserId list)

## 2) Quick sanity: firm tables exist

Run your usual migration verify script:
- `backend/migrations/migration-verify.sql`

It should confirm the firm tables and new plan quota columns exist.

## 3) Legacy fallback (firm scope OFF)

1. Set `FIRM_SCOPE_ENABLED=false`.
2. Hit billing endpoints (whatever your frontend calls for “plan/usage”).
3. Confirm response still reflects **tenant=user** behavior and does not error.

## 4) Firm bootstrap and membership (firm scope ON)

1. Set `FIRM_SCOPE_ENABLED=true`.
2. Log in as a normal lawyer user and perform an action that resolves firm context (e.g., call billing, upload a signing file).
3. Confirm:
   - a default firm exists (key/name from env), and
   - the user is auto-added to `firm_users`.

## 5) Billing should prefer firm scope

With firm scope enabled:
- Billing endpoints should return limits/usage with `scope: "firm"` (or equivalent), and include the `enforcementMode`.
- If firm tables are missing (or resolution fails), it must safely fall back to legacy tenant scope.

### Example requests (curl)

Set these once per shell:

- PowerShell:
  - `$BASE_URL='http://localhost:5000'`
  - `$TOKEN='YOUR_JWT_HERE'`

Billing (tenant-visible):

- Get current plan:
  - `curl.exe -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/billing/plan"`
- Get current usage:
  - `curl.exe -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/billing/usage"`

Platform admin (requires allowlisted user):

- List firms:
  - `curl.exe -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/admin/firms"`
- Create/update a firm:
  - `curl.exe -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "{\"firmKey\":\"acme\",\"name\":\"Acme Law\"}" "$BASE_URL/api/admin/firms"`
- Assign a firm plan:
  - `curl.exe -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "{\"planKey\":\"PRO\"}" "$BASE_URL/api/admin/firms/1/plan"`
- Read firm usage:
  - `curl.exe -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/admin/firms/1/usage"`
- Set unlimited override:
  - `curl.exe -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "{\"unlimitedUntilUtc\":\"2026-12-31T23:59:59Z\"}" "$BASE_URL/api/admin/firms/1/override"`

## 6) Metering & enforcement checks

### Upload path
- Upload a PDF.
- Confirm (when schema supports):
  - `signingfiles.firmid` is populated
  - `signingfiles.unsignedpdfbytes` is populated
- Confirm a `firm_usage_events` row is written for document creation.

### OTP path
- Trigger OTP SMS.
- Confirm:
  - firm quota check runs before sending
  - after a successful send, a `firm_usage_events` row with `event_type = otp_sms` is written

### Evidence generation
- Generate evidence ZIP / certificate.
- Confirm:
  - firm quota check runs
  - `firm_usage_events` rows are written for `evidence_generation` and best-effort `evidence_cpu_seconds`

### Warn vs block
- Set `LIMITS_ENFORCEMENT_MODE=warn`:
  - requests should succeed but surface warnings (where your API returns warnings)
- Set `LIMITS_ENFORCEMENT_MODE=block`:
  - over-quota requests should return an error and avoid executing the expensive action

## 7) Retention cleanup firm awareness

- With firm scope enabled, run:
  - `node backend/scripts/retentionCleanup.js --dry-run --firm`
- Confirm it:
  - discovers firms/scopes correctly
  - still requires explicit delete gates for execute mode

## 7.5) Backfill firm IDs (optional but recommended)

This is recommended once after enabling firm scope, to populate `signingfiles.firmid` for older rows.

Dry-run (default):

- `node backend/scripts/firmBackfill.js`
- Limit processing:
  - `node backend/scripts/firmBackfill.js --max 1000`
- Only newer rows:
  - `node backend/scripts/firmBackfill.js --since 2025-01-01`

Execute (requires explicit safety gates):

- `FIRM_SCOPE_ENABLED=true BACKFILL_ALLOW_WRITE=true BACKFILL_CONFIRM=YES node backend/scripts/firmBackfill.js --execute`

After backfill:

- Billing usage should show consistent firm-scoped counts (documents/storage/OTP/evidence) with fewer “unknown/unattributed” rows.

## 8) Notes

- Older `signingfiles` rows may have `firmid` NULL until backfilled; the code should behave safely.
- If you see DB connection timeout logs during `node --test`, they can be harmless in tests that don’t require DB access, but are worth cleaning up separately.
