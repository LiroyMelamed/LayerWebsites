# Backend gates on the unified local main candidate

Tested candidate: `176ff60a377136ce6a01b43c1defd23f2fe0674b`, based on shared
main `53d177ee` plus the four reviewed billing commits. No production source,
assertion, signing manifest, shared dependency installation or active branch was
changed by this QA subtask. Fresh evidence is separate from the historical
billing reports.

## Final results

| Gate | Current-source result | Evidence |
| --- | --- | --- |
| 26 payment/signup backend files | **191 passed, 0 failed, 1 skipped** | [output](billing.tap), [selection/source pins/receipt](offline-gates.json) |
| 10 common profile, tenant, auth, client portal and Word/router files | **98 passed, 0 failed, 1 skipped** | [output](common-boundaries.tap), [selection/source pins/receipt](offline-gates.json) |
| Actual PostgreSQL 17 card/debt races and settlement | **51 passed, 0 failed, 0 skipped** | [output](real-postgres.tap), [receipt](real-postgres.json) |
| Existing protected-source release guard | **103/103 files accepted**, existing manifest unchanged | [receipt](source-release-guard.json) |

The SQL 51 overlap the 191 payment tests and must not be added as unique
coverage. All pinned backend/test/migration/guard sources were stable during the
offline gates. The real SQL gate independently pins the unchanged billing
service SHA256 `5f6ecd8d26503d7a79a082809907df309da0c19b875fbb31e5f87facb2280e80`.

The common gate covers profile normalization, exact read permissions and scope,
personal versus organization identifiers, customer-role recovery, legacy and
shared-office client boundaries, auth error shape, real Express Word/stage
feature entries, Word-origin restrictions, sanitized HTTP failures and Word
route permission/idempotency boundaries. Service, storage, email and provider
boundaries are synthetic. PGlite exercises real local SQL where the tests use it.

## Exact dependencies and reproduction

The existing canonical backend dependency tree differed from the candidate's
lockfile. A separate `/tmp/layer-billing-lock-deps` installation used only the
candidate `package.json` and `package-lock.json` with
`npm ci --ignore-scripts --no-audit --no-fund`. No install hook or browser download
ran. Every **520 installed packages** matches the candidate lock, with zero
missing required packages or version drift. Missing optional packages target
other operating systems/architectures. See [dependency proof](dependency-proof.json).
The candidate lock SHA256 is
`d36bab8fed79c2e157d1b701a71d8e3a9dee014b19a12d20bd1fe376f4c3c651`.

Node was **24.14.0**. PGlite **0.5.10**, Sharp **0.35.4**, bcrypt **6.0.0**,
axios **1.20.0**, compression **1.8.2**, nodemailer **10.0.15** and pg **8.20.0**
loaded successfully. Owned worktrees may link to this exact tree; never change
the shared dependency tree to reproduce these results.

From this worktree, run:

```sh
node docs/releases/card-save-billing-20261101/integration-qa/main-backend/run-offline-gates.cjs
```

The runner uses a clean environment, the exact dependency tree, no billing
snapshot preload, and the existing outbound guard. External fetch/TCP and
application DB ports are blocked before connection. Synthetic ephemeral HTTP
test servers require the local-listener sandbox allowance. The source selection,
commands, timestamps, log hashes and complete source hashes are in the receipt.

The real SQL gate restarted only the previously owned fixture cluster
`/tmp/layer-billing-pg.dJ0RrF/data`, host `127.0.0.1`, port `55449`, database
`billing_card_setup_qa`, user `billing_qa`, with fresh per-test schemas and up to
eight real clients. Its additional [guard](real-postgres-network-guard.cjs)
allows only that exact TCP target and blocks native fetch; independent
[guard checks](real-postgres-guard-checks.json) confirmed that external TCP,
application DB, signup DB and native fetch fail before connection/request.
No role, access, database or cluster was created. The cluster was stopped after
the run; `pg_ctl status` reported no server and the listener check was empty.
See [cleanup](postgres-cleanup.json).

## Initial infrastructure failures and remaining holds

Initial restricted attempts could not create the synthetic HTTP listeners or
connect to the isolated SQL fixture (`EPERM`). These were environment failures,
not product regressions. The exact gates then passed under the narrowly
authorized local-network allowance with the application/provider guards still
active. Initial [billing](billing-restricted-network.log),
[common](common-boundaries-restricted-network.log),
[offline receipt](offline-gates-restricted-network.json) and
[SQL](real-postgres-restricted-network.log) evidence remains preserved.
The runner's first source-inventory attempt also encountered Git's quoted
Unicode filenames before starting tests; it now uses NUL-delimited paths.
No production code or test assertion changed to obtain a pass.

Two integration gates remain unexecuted:

- Full signup/office-policy lifecycle: the authorized named release database
  and `SIGNUP_RELEASE_QA_CONFIG` remain unavailable. The billing gate skips it.
- Client-profile PostgreSQL migration/RLS integration: this task was not supplied
  an owned fixture using `CLIENT_PROFILE_TEST_SOCKET` at the test's fixed
  `/tmp/codex-client-profile-55487` or `55488` socket. The common gate skips it.
  Other active QA clusters were neither inspected nor borrowed, and no
  environment, database or role was recreated.

These portable gates and the isolated billing SQL suite do not establish full
signup, deployed schema/ACL state, actual converter rendering, production build,
browser acceptance or provider receipt/email delivery. The separate sandbox
identity/document-settings holds remain unchanged. No real payment, document,
email, live billing repair, customer database operation, deployment or push ran.
