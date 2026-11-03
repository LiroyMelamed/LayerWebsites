> **CANCELLED BY OWNER. Historical, unexecuted proposal only. Do not run any setup/install commands below. No new Mac PostgreSQL/database/role/extension is permitted. This is not awaiting approval.**

# Closing the two real-PostgreSQL QA fixture holds

**Plan only: no fixture, role, database, configuration, server or extension was created.**
The frozen product source is `6a3bd299227291feb0065ae3afa89a1f3ba2967a`,
upstream cutoff `074df7520497a0cd6bd95ad70353201c905f0aa6`. The two skipped
integration tests are not replaced by the existing 57-case billing SQL result.
No production, customer, provider, mail or document operation is proposed here.

## Findings from source and existing local catalogs

- `clientDocumentProfile.postgres.test.js` has one parent and 13 subtests. It
  creates its own minimal legacy `users` table and synthetic rows, applies the
  real profile migration twice, runs the real controller with mocked transports,
  checks concurrent stale writes and then tests a synthetic non-bypass RLS role.
- It accepts only `/tmp/codex-client-profile-55487` or `55488`, the corresponding
  port, login name `client_profile_test_owner`, and database `postgres`. It never
  inherits the application's `DB_*` connection values. It creates a second role
  `client_profile_scoped` itself. Both names must belong to a new owned cluster.
- `signupLifecycle.officeIsolation.integration.test.js` has one parent and 14
  subtests. It asserts `127.0.0.1:55440/legal_signup_release_20261013_qa`, then uses
  `config.user` / `config.password` as a real app role. Its provider, storage,
  welcome mail and SMS calls are mocked; its HTTP requests are synthetic local
  Express/Supertest requests. No sandbox credential or actual provider is needed.
- The signup test calls `ensureOfficeIsolation()`. Every present public table
  must be classified, RLS-enabled and forced, have the restrictive boundary
  policy, and **not be owned by the connected app role**. That app role must be
  neither superuser nor BYPASSRLS. Connecting the test as the existing local
  administrator would fail the contract and would not be valid QA.
- Read-only catalogs on the already-running loopback cluster 55440 reconfirmed
  both expected signup database names absent. The current existing admin can
  create databases/roles; no existing signup/release/office-named test roles were
  found. No login as another role was attempted. `pgcrypto` and
  `pg_stat_statements` are available; **`vector` is not available**.
- Historical private schema-only files exist (52 tables; zero top-level COPY
  data or INSERT statements). They include all 14 checked core signup tables.
  The original requires pgvector. The historical billing-adapted variant omits
  that extension and changes the unrelated embedding type to text. That variant
  cannot silently be called full schema/RAG parity. The raw private SQL is not
  copied into Git; hashes and bounded structural counts are in the machine plan.

## Action A: profile fixture — technically self-contained, approval pending

The earlier scope prohibited creating new environments/access. The precise new
request is approval for **one disposable synthetic PostgreSQL cluster only**,
with no TCP listener or production data, under `/tmp/layer-billing-qa-fixtures-20261101`,
Unix socket `/tmp/codex-client-profile-55487`, and the two test-only role names
above. Use 55488 only if 55487 is occupied, never evict another process or reuse
an existing database containing `users`.

Before executing, verify `PGDATA`, socket and socket lock do not already exist;
if any do, stop and inspect ownership rather than deleting/reusing them. Verify
fixed source and exact dependency locks, and hold the shared heavy-work mutex.
The following is the concrete setup recipe **after approval**, with PostgreSQL
17 already installed:

```sh
fixture_root=/tmp/layer-billing-qa-fixtures-20261101
profile_socket=/tmp/codex-client-profile-55487
profile_pgdata="$fixture_root/profile-55487"
install -d -m 700 "$fixture_root" "$profile_socket"
/opt/homebrew/opt/postgresql@17/bin/initdb -D "$profile_pgdata" -U client_profile_test_owner --auth-local=trust --auth-host=reject --encoding=UTF8 --locale=C
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D "$profile_pgdata" -l "$fixture_root/profile-55487-server.log" -o "-p 55487 -k $profile_socket -c listen_addresses='' -c unix_socket_permissions=0700" -w start
```

`initdb -U` makes this cluster's setup role a superuser. This is intentional for
this existing test's setup: it creates another role and adjusts rows after
FORCE RLS, before `SET ROLE client_profile_scoped`. The scoped role is explicitly
NOLOGIN/NOSUPERUSER/NOBYPASSRLS and is the identity used for the RLS assertions.
Neither role is an application/production identity. Do not grant these setup
powers on any existing/shared/production cluster.

Run only the unchanged test with a clean environment, exact dependency root,
explicit socket opt-in, and a guard allowing only that socket; unmocked fetch
and every other socket must be blocked before connection:

```sh
env -i PATH=/usr/bin:/bin TMPDIR=/tmp NODE_ENV=test NODE_PATH=/tmp/layer-billing-lock-deps/node_modules CLIENT_PROFILE_TEST_SOCKET=/tmp/codex-client-profile-55487 \
  python3 /tmp/layer-billing-integration-20261101/tools/with-build-lock.py \
  /Users/liroymelamed/.nvm/versions/node/v24.14.0/bin/node \
  --require /tmp/layer-billing-main-current-20261101/docs/releases/card-save-billing-20261101/release-qualification/qa-fixture-closure/profile-network-guard.cjs \
  --test --test-reporter=tap backend/tests/clientDocumentProfile.postgres.test.js
```

Normal local-listener approval may still be needed by the execution sandbox;
that does not authorize external access. Before a positive run, verify this
new guard rejects external HTTP, application database ports and the other
fixture socket without opening them. A source failure must be recorded, not
fixed by weakening assertions or retargeting the test's safety allowlist.

In `finally`, stop **only** this owned cluster with `pg_ctl -D "$profile_pgdata"
-m fast -w stop`, verify no owned socket/listener remains, and preserve private
fixtures/logs for review. Do not remove another cluster, drop shared roles or
clean arbitrary `/tmp` directories. Rerun needs a fresh owned cluster because
this test intentionally does not drop its table/roles.

## Action B: signup fixture — schema decision and local access approval pending

This test's fixed 55440 port is already used by other QA. **Do not stop, restart,
retarget or change that cluster's configuration/pg_hba**, and do not borrow its
other databases. A proposed bounded setup would create only:

- Database `legal_signup_release_20261013_qa`, template0/UTF8, on the existing
  local 55440 instance; no rows restored from any customer database.
- Schema owner `legal_signup_release_owner_20261101`, NOLOGIN and no superuser,
  BYPASSRLS, CREATEDB or CREATEROLE capability.
- App role `legal_signup_release_app_20261101`, LOGIN with a generated private
  synthetic password, NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE/NOINHERIT,
  no membership in the owner role. Grant only the new database's required
  schema/table/sequence/function privileges. Do not grant it privileges on other
  existing QA databases or rotate an existing credential.
- A private mode-0600 JSON config outside Git containing exactly `host`, `port`,
  `database`, `user`, `password`; template in [the machine plan](plan.json).

**Precondition before any creation:** approve a current schema-only fixture and
an explicit migration manifest. Source code alone is not a complete fresh
bootstrap, and the private October schema is historical. Do not run the entire
production migration/backfill wrapper as a fixture shortcut.

A candidate minimum delta manifest from that historical base includes consent,
logo, final recurring quote, auto-renew, renewal-cycle/retry, welcome delivery,
Central consent/outbox and the profile migration. It is listed, hashed and marked
**unreviewed/unexecuted** in [plan.json](plan.json). Additional source/migration
requirements must be resolved before calling the fixture ready. In particular,
choose an approved pgvector-capable schema/runtime, or explicitly accept a
billing-focused fixture with the unrelated embedding-only adaptation and state
that limitation. Do not install a global extension or weaken a type silently.

After that precondition and separate local-creation approval, execute scoped
steps, aborting on every error:

1. Check role/database absence and fixed cluster identity. Create the two new
   roles and database with identifiers escaped by the database driver; never
   interpolate or print the generated password in command arguments/logs.
2. Restore only the approved schema-only input into the **new named database**
   as its schema owner; apply only the approved pinned manifest, recording hashes.
3. On that new database only, invoke the existing explicit
   `backend/scripts/install-office-isolation.js` installer with
   `MULTI_TENANT_MODE=true` and `TENANT_DB_ISOLATION_ENABLED=1`, using its schema
   owner/admin connection. It changes RLS/policies/triggers and ownership-related
   defaults: it must never run against a dedicated/live tenant as part of this QA.
4. Grant the non-owning app role only required new-database DML/sequence/function
   privileges. Assert all checks in `isolationSchema.assertIsolationReady()`
   using that app role before running the test. No table may be app-owned.
5. Assert the source working copy has no `backend/.env`, clear inherited
   credentials/config, and supply only the private synthetic config path. Use a
   dedicated native network guard permitting just 127.0.0.1:55440 and the test's
   own ephemeral loopback HTTP fixture; block other database/provider targets.
   The old offline guard deliberately blocks 55440 and must not simply be omitted.
6. Run the exact command below under the same global heavy-work mutex. The test
   itself injects random JWT/encryption secrets and all provider/mail/storage
   stubs; no real API keys should exist in the process.

```sh
env -i PATH=/usr/bin:/bin TMPDIR=/tmp NODE_ENV=test NODE_PATH=/tmp/layer-billing-lock-deps/node_modules \
  SIGNUP_RELEASE_QA_CONFIG=/tmp/layer-billing-qa-fixtures-20261101/signup-release-qa-private.json \
  python3 /tmp/layer-billing-integration-20261101/tools/with-build-lock.py \
  /Users/liroymelamed/.nvm/versions/node/v24.14.0/bin/node \
  --require /tmp/layer-billing-qa-fixtures-20261101/signup-network-guard.cjs \
  --test --test-reporter=tap backend/tests/signupLifecycle.officeIsolation.integration.test.js
```

The signup guard/bootstrap/config above have **not been created or executed**.
It is not yet a fully approved executable fixture recipe. Test cleanup closes
only its pool/HTTP fixture; leave the synthetic named DB/roles for review. Never
stop the shared 55440 service. Any later deletion must target only objects
created by this approved run after checking dependencies; do not infer ownership
from a date/name or touch another QA database.

## Approval wording and current status

- **A, ready for a bounded approval:** create/start/stop the isolated local
  socket-only profile fixture and run its unchanged test, using synthetic data
  only. This creates new local test identities; no production access is created.
- **B, not ready for blind creation:** first approve/provide the schema-only
  provenance/manifest and resolve the pgvector-vs-billing-fixture scope; then
  approve the new named local DB/app/owner roles and private config. The fixed
  test itself need not change. No new provider/sandbox transaction is needed.

Neither action was denied. Both are **not executed**, pending the stated new
local-environment/access authorization; B also has the explicit schema dependency.
No product test was run by this planning subtask, and no prior skip is relabelled
PASS. No customer-specific reconciliation material is included.

## Full-schema route without a fake vector type

Prefer a newly verified **schema-only** artifact from the existing authorized QA
schema or verified backup, retained privately with its hash and source/catalog
binding. Do not copy customer rows, environment values or credentials. Review
schema objects/defaults/functions for private literals before any export into a
code repository; the schema itself should stay outside Git. This avoids guessing
which current migrations a historical 52-table fixture lacks.

A real pgvector installation is required to restore its actual `vector` type.
The [official pgvector installation notes](https://github.com/pgvector/pgvector#installation-notes---linux-and-mac)
explain selecting the intended PostgreSQL installation through `PG_CONFIG`.
For this host that is `/opt/homebrew/opt/postgresql@17/bin/pg_config`, reporting
PostgreSQL 17.11. Extension files would go into `/opt/homebrew/lib/postgresql@17`
and `/opt/homebrew/share/postgresql@17/extension`, outside this workspace.
Enabling `CREATE EXTENSION vector` is a separate per-database operation; only
its new synthetic database should be targeted. No PostgreSQL package upgrade,
service restart or change to an existing database/pg_hba is part of this request.

Before installation, obtain only the existing QA extension-version metadata and
pin a compatible official release/commit. After explicit approval, build with
that exact PG_CONFIG, inspect the install target list, then install the library,
control and SQL files for PG17. Do not use an unpinned `brew upgrade` or silently
install to another PostgreSQL major. This is an additional local infrastructure/
filesystem approval, followed by the database/role/config approval above. A real
vector type preserves schema semantics; it still does not claim RAG behavior or
production-version parity unless those are independently checked.
