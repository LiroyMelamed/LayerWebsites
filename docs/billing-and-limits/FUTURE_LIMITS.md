# Future limits (not implemented yet)

This iteration implements **retention cleanup only** for signing documents.

The schema is designed to be extended later for:
- Monthly document quota (per tenant)
- Storage quota (GB)
- Case/client quotas
- Feature flags (e.g., OTP enabled, evidence package availability)

## How to extend
- Add new cleanup/validation modules under `backend/lib/plan/`.
- Add enforcement points in the relevant controllers (cases/clients/uploads).
- Use `tenant_subscriptions` + `subscription_plans` as the source of truth.

## Principles
- Platform-owned: tenants cannot self-serve plan changes.
- Backward compatible: legacy storage keys must remain supported.
- Auditable: record actions in a run log table (and later in `audit_events`).
