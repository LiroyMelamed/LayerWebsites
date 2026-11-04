# Existing QA only: eligibility, scope and remaining decisions

**Binding owner decision:** no new Mac PostgreSQL/database/cluster/roles/extension
setup. The earlier local recipe is cancelled, not awaiting approval, and was
never executed. This addendum changes audit documents only. Frozen financial
source remains `6a3bd299` on main cutoff `074df752`.

## What the existing QA actually provides

Read-only evidence supplied by the coordinator/backend audit:
`/tmp/layer-billing-deploy-preflight-20261101/remote-preflight.json` and
`qa-eligibility.json`.

| Property | Existing Melamedia QA |
| --- | --- |
| Database/runtime | `melamedia`, existing backend loopback5432, PostgreSQL16.15 |
| Types/catalog |116 public tables; native vector0.6.0/public; pgcrypto1.3 |
| App identity |`melamedia_app`; not superuser, no BYPASSRLS, no public table ownership |
| Deployment mode |Dedicated;0 public RLS tables and0 FORCE RLS tables |
| Existing isolated fixtures |Neither fixed signup fixture DB name, no `qa_`/`test_` namespace verified |
| Data boundary |Purely synthetic population and a task-owned tenant/record scope not proven; no app/customer rows queried |
| Signup activation |`SELF_SERVICE_SIGNUP_ENABLED` is false on QA; not captured for the other three clients |
| Financial transport |Takbull mode PROD; non-settling merchant not verified; candidate financial flag unset/default-enabled |
| Other outbound |Valid SMS/email/push noop with no allowlist exceptions; **does not cover Takbull** |

This is a real existing QA environment, but it is not the disposable shared-RLS
fixture expected by the skipped test. Its privileged ability to CREATE a schema
is not authorization to do so. Do not run native card setup, checkout, renewal,
provider settings or document tests against the current QA process.

## Exact legacy integration tests cannot be redirected unchanged

**Profile:** the test only accepts two fixed local Unix sockets, database
`postgres` and `client_profile_test_owner`. It creates `users`, applies a real
migration to `public.users`, creates a role and enables/forces a synthetic RLS
policy on that table. The existing QA already has `public.users`. This test is
not an in-place smoke and must not be pointed at QA by weakening the guard or
changing its connection behind the allowlist.

**Shared signup:** the test requires
`127.0.0.1:55440/legal_signup_release_20261013_qa`, forces shared mode, and requires
a non-owning/non-bypass role with classified, forced-RLS tables and restrictive
policies. Current QA uses a different name/port and dedicated no-RLS mode; three
additional public table names also lack shared classification in this frozen
source. Before creating its own synthetic office, the old test disables
`auto_renew` for all previous `qa-release-%` offices named `Synthetic release office`.
Those rows are not proven to belong to this task. The two contracts are
incompatible even if provider methods are mocked. No attempt was made to bypass
them or execute DDL/business mutations.

## Required gate versus inherited missing evidence

| Missing result | Change/dependency evidence | Honest release treatment |
| --- | --- | --- |
| Profile migration/controller PostgreSQL fixture |`customerController.js`, `clientProfile.js`, profile migration and all three profile tests are byte-identical on074→6a3. Changed financial modules do not import the profile controller/helper. Common124 tests and selected live profile metadata on four targets are separate evidence. |**Inherited unexecuted coverage gap**, not evidence of a new profile regression. The release owner may explicitly carry/defer it for a scoped financial release; never label the skipped SQL fixture PASS or silently remove it after denial. |
| Real shared signup/provisioning/office-policy lifecycle |Signup service, renewal/upgrade and verification/gateway paths changed. The skipped test exercises those under actual office RLS. |**Affected integration coverage gap** for activation of those shared/new-signup paths. It needs suitable existing-QA evidence, or an explicit dedicated-only scope/activation decision with the affected routes kept closed. |

The profile route still has an **indirect** dependency on the changed billing
snapshot through `authMiddleware` and `requireBillingAccess`. The inherited
classification above applies to the profile persistence/migration fixture, not
a claim that every profile access path is unchanged. Existing billing-access
boundary tests and the new paused snapshot/lock cases cover different parts of
that dependency; they are not a full real-DB profile-route result. The skipped
profile fixture itself uses a VM controller and does not exercise that auth route.

The57 real PostgreSQL billing cases remain meaningful: they execute actual
billing SQL, row/advisory locks and concurrency. They use a minimal synthetic
schema and VM-injected tenant context, signup provisioning, self-service renewal
and provider/mail boundaries. They do **not** execute real `scopedPool` RLS or
full signup provisioning. They cannot be relabelled as the missing shared test.

All four deployment projections are dedicated; QA self-service signup is closed.
A dedicated-only release decision would still need the corresponding flag
verified on the other three targets and shared/new-signup activation kept closed.
That is a scope decision, not a passing integration result. It does not resolve
independent backup/restore/drain/hosted-order/callback safety gates.

## Safe existing-QA options

1. Existing catalog/constraint/source/static/health evidence can be completed
   read-only. It must retain its narrower claim, not become an end-to-end PASS.
2. An unchanged profile **controller smoke** could use only newly owned synthetic
   records with a VM-injected database transaction and mocked transports, without
   running the old bootstrap/migration/RLS fixture. Before execution, prove the
   existing `users` defaults and noninternal triggers/functions have no unsafe
   side effects; bind the exact app role/database and owned record IDs; reject
   any SQL targeting existing records; block all HTTP/TCP/fetch except the exact
   database; start no app server/worker. Those trigger/default/no-egress/fixture
   proofs are not captured yet. No smoke has been run. Even a pass would not
   replace migration-twice or synthetic FORCE RLS assertions.
3. Full shared signup needs a compatible, already-existing authorized isolated
   QA fixture. None is verified by these catalogs. Do not use another active
   database, new schema/roles/configuration, public table replacement or a test
   safety-guard change as an implicit workaround. Surface the precise missing
   fixture/scope decision to the owner.

## Schema-only export: narrowly scoped review, no automatic fallback

The prior mapped-app-role schema dump actually ran, failed database permission
with exit1 and produced zero DDL bytes. Its outcome is known; it did not complete
an export. Do not retry as an administrator merely because it is available.

A separately reviewed action could use **the exact identity already used by the
existing installed DB-only backup producer**, bound to its verified command and
scope, without any new role, GRANT, password rotation or configuration change.
Known producer path/hash:
`/usr/local/sbin/melamedia-server-backup.py`,
`085b3d946f475d1ad8ebd78f60aed389d6fea661963e34389b8991d339b2d160`.
Source-only inspection at23:44:35UTC verified line185 invokes
`runuser -u postgres -- pg_dump -Fc --dbname <configured-database>`.
This proves the existing **OS identity `postgres`**. It does not independently
prove the effective database role or PGHOST inherited by the producer. Do not
claim those were observed or silently reuse unspecified environment values.

Proposed narrowly bound approval wording:

> לאשר ייצוא חד־פעמי של **הסכמה בלבד** ממסד QA `melamedia`, באמצעות משתמש מערכת הגיבוי הקיים `postgres` בלבד? תחילה נאמת בקריאה בלבד שהחיבור הוא לתפקיד DB `postgres`, למסד `melamedia` ול־socket המקומי הקיים של PostgreSQL ב־5432; בכל אי־התאמה נעצור. הייצוא יישמר כקובץ פרטי עם hash תחת נעילות התחזוקה וה־QA הקיימות. לא ניצור או נשנה מסד/תפקיד/GRANT/pg_hba/סיסמה/תצורה, לא נעתיק שורות לקוחות ולא נפעיל יישום, ספק או גבייה.

Before any higher-identity DB connection, require that specific new approval.
Then bind the existing local Unix-socket directory from permitted catalog
metadata; do not guess or redirect to TCP. Under the existing shared maintenance
and `melamedia-legal-melamedia-release` locks, use the already-installed pg_dump,
clear inherited PG connection variables, and explicitly set DB role`postgres`,
port5432 and database`melamedia`. The first new connection must be a read-only
identity preflight asserting those exact values and read-only mode. Authentication
or mapping failure stops: no peer/HBA change, password rotation, GRANT or next
fallback. The proposed DB role is an explicit approval target, not an identity
already independently observed by this analysis.

Only after that preflight, the bounded command shape is:

```text
runuser -u postgres -- pg_dump
  --host=<verified-existing-local-Unix-socket-directory> --port=5432 --username=postgres
  --schema-only --no-owner --no-privileges --no-comments --no-security-labels
  --no-publications --no-subscriptions --lock-wait-timeout=5s
  --format=plain --dbname=melamedia
```

Set `PGOPTIONS` to read-only and bounded statement/lock timeouts in the child,
keep any credential only in memory if the existing authenticated mechanism
requires one, and emit no row/function/default text in public logs. Do not invoke
the full backup producer for a schema-only request: it has separate dump/data/
storage/status effects. Keep SQL private outside Git and review private literals
before reporting text. Export alone does not authorize a restore, new Mac fixture
or test execution. This action remains separately reviewable and not executed.

## Extension compatibility research — reference only, no install request

The version-matching candidate is **pgvector0.6.0**, immutable commit
[`281d4fcf60e2f037fa09d62be2543bb4d7511f2b`](https://github.com/pgvector/pgvector/commit/281d4fcf60e2f037fa09d62be2543bb4d7511f2b).
Its [official CI definition](https://github.com/pgvector/pgvector/blob/281d4fcf60e2f037fa09d62be2543bb4d7511f2b/.github/workflows/build.yml)
includes PostgreSQL17 Ubuntu build/installcheck, and its
[control file](https://github.com/pgvector/pgvector/blob/281d4fcf60e2f037fa09d62be2543bb4d7511f2b/vector.control)
declares0.6.0. This supports a candidate compatibility claim; **no native Mac
17.11 compile/load was performed**, so success here is not proven. There is no
basis to declare0.6.0 incompatible or force an upgrade solely from release age.

Version0.8.7 at commit
[`f37c13f68b57d2c3472b2214fbcff699d6d34876`](https://github.com/pgvector/pgvector/commit/f37c13f68b57d2c3472b2214fbcff699d6d34876)
also has PostgreSQL17 in its [official CI](https://github.com/pgvector/pgvector/blob/f37c13f68b57d2c3472b2214fbcff699d6d34876/.github/workflows/build.yml).
Using it would introduce an extension-version difference from QA0.6.0; a
financial/signup test result would not establish embedding/index/version parity.
It is not selected or installed.

Bounded local inspection found no PG16/vector runtime in the normal Homebrew or
Postgres.app paths. Docker CLI exists but its current Colima Unix socket is
absent; no daemon/image/container was queried or started. A different-port local
server would fail the unchanged55440 contract; replacing that occupied service
or creating a new Mac/container DB would violate the owner decision. All local
installation proposals remain cancelled regardless of these research findings.

## Follow-up disabled-path scope

A bounded nonsecret flag read also confirmed self-service signup is absent/effectively false on AshrafEssa, MorLevi and MelamedLaw; QA was already false. The observed four dedicated deployments therefore keep shared signup disabled. This is a disabled-path coverage gap, not a passing integration test or authorization to enable signup. [Scope evidence](../deployment-live-preflight/eligibility-scope-addendum.json).
