# Full signup QA environment discovery — 1 November 2026

Result: **blocked; full integration not executed**. The test's safe config gate
ran and skipped the single parent test; see
[`full-signup-config-gate.tap`](full-signup-config-gate.tap). This is not a passing
signup lifecycle result.

Target action: run
`backend/tests/signupLifecycle.officeIsolation.integration.test.js` against its
existing authorized local release QA fixture. The test requires
`SIGNUP_RELEASE_QA_CONFIG` and asserts host `127.0.0.1`, port `55440`, database
`legal_signup_release_20261013_qa`.

Checked without customer/provider data access:

- Read the versioned signup test ledger and the private October 13 verification
  runbook and local preview configuration source.
- Confirmed that the existing PostgreSQL 17 QA cluster listens only on loopback
  port 55440 and runs from the documented signup implementation QA cluster path.
- Queried **database names only** in `pg_database` on that cluster. Neither
  `legal_signup_release_20261013_qa` nor the older `signup_legal_qa` exists. The
  remaining databases belong to other QA tasks and were not used or changed.
- The private `signup-release-qa-private.json` referenced by the October 13 local
  preview and account harness no longer exists at its recorded temporary path.
- No current `SIGNUP_RELEASE_QA_CONFIG` was supplied. The old sandbox provider
  configuration file still exists; its secret values were not displayed or used
  by this discovery.

The action was **not denied by approval review** and has no uncertain outcome.
It remains pending because the named authorized database and its configuration
are absent. Recreating a database, restoring an old environment or issuing new
access was outside this continuation's scope. No existing QA database was
replaced, no application schema or billing row was changed, and no provider,
email, cron or production operation was run.

The previously recorded portable mocked-provider lifecycle boundaries and the
isolated real-PostgreSQL billing race suite remain separate evidence; they do
not substitute for this complete office-policy signup gate.
