# Document retention (SigningFiles)

## Scope (this iteration)
- Applies only to signing documents: `signingfiles` and related evidence tables.

## Eligibility
A signing file is eligible for deletion when:
- `status` is `signed`
- `legalhold` is false
- `coalesce(signedat, createdat) < cutoff`

Where:
- `cutoff = now - effective_documents_retention_days`
- `effective_documents_retention_days = max(plan.documents_retention_days, PLATFORM_MIN_DOCUMENT_RETENTION_DAYS)`

## Legal hold override
Legal hold always prevents deletion.
- Stored on `signingfiles` as:
  - `legalhold` boolean
  - `legalholdatutc` timestamptz
  - `legalholdreason` text

## Storage safety rule
The cleanup script deletes storage objects **before** deleting DB rows.
- If any storage deletion fails for a document, the DB rows for that document are not deleted.

## Run audit trail
Each run writes a record to `data_retention_runs` (including dry runs).

## How to run
Dry-run (default):
- `node scripts/retentionCleanup.js --dry-run`

Execute (requires safety gates):
- `RETENTION_ALLOW_DELETE=true RETENTION_CONFIRM=DELETE node scripts/retentionCleanup.js --execute`
