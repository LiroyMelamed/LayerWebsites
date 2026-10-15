# Preserve deployed behavior before tenant upgrades

The 2026-10-06 deployment preflight found uncommitted runtime changes on the MelamedLaw server at Git HEAD `8dc85966fc62f2d6d66025c670e232afb0208ac2`. A private, hashed copy was preserved before any server mutation. The release candidate must retain these behaviors when updating from main:

- Named production/sandbox Takbull credentials, the existing legacy credential fallback, configurable card verification amount, checkout confirmation endpoint and provider transaction-number extraction.
- Production case hard deletion disabled unless explicitly enabled. Even with the override, linked files, signing documents, descriptions, clients and calendar records prevent deletion.

The case controller retains main's role and tenant permission checks. The parent case is locked inside the transaction before checking related records, preventing concurrent foreign-key inserts from racing the check. This change does not perform a payment, enable billing, change credentials, or delete production records.

Other tenants' local calendar controller, platform billing adapter and signer-contact helper were already identical to main. Their remaining signing/PDF differences are superseded by the separately tested immutable artifact and geometry fixes; they must not be copied over current main.

## Validation

From `backend/`, using the isolated database specified in `SETTINGS_CONSUMER_REGRESSION.md`:

```sh
node --require ./tests/helpers/settingsIsolation.js --test \
  tests/liveServerPreservation.test.js \
  tests/caseLegalDataPreservation.integration.test.js \
  tests/platformBilling.test.js tests/requireBillingAccess.test.js \
  tests/billingDefaults.lock.test.js tests/billingEmails.test.js \
  tests/caseScope.recovery.test.js tests/writeReferences.recovery.test.js
```

58 checks passed, including 10 preservation checks and 6 PostgreSQL checks. The database fixtures run inside a rolled-back transaction. Provider validation in the checkout controller test is a stub; this does not establish real payment-provider readiness or perform a charge. Existing legacy fallback is preserved and explicitly identified as legacy rather than mislabeled as a tested sandbox.

QA deployment and tenant rollout remain separate gates. Source changes and test passage alone are not production approval.
