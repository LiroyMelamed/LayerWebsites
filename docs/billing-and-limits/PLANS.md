# Plans

This platform uses **platform-owned** subscription plans. Tenants cannot change retention.

## Commercial pricing (display-only)
- Core: ₪249 / month (no signatures)
- Signing + Evidence add-on: ₪299 / month includes 100 signed documents
- Overage: ₪6 per additional signed document

Note: The prices above are intended for UI/docs consistency. They are not necessarily enforced by the current plan/limit implementation.

## Plan keys
- `BASIC`
- `PRO`
- `ENTERPRISE`

## Retention (documents only)
- `BASIC`: 60 days
- `PRO`: 180 days
- `ENTERPRISE`: 365 days

## Platform floor
Deletion will **never** occur earlier than `PLATFORM_MIN_DOCUMENT_RETENTION_DAYS` (env; default 60), even if a plan is configured lower.

## Notes
- Future quota fields exist in the schema but are not enforced in this iteration.
