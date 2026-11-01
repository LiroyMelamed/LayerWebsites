# Latest-main backend qualification — 6a3bd299

All gates passed on the committed, unchanged source
`6a3bd299227291feb0065ae3afa89a1f3ba2967a`. This integrates the retained financial release with shared main
`074df7520497a0cd6bd95ad70353201c905f0aa6`. The only additional backend paths since the prior
qualified runtime are `qaOutboundNoop.js` and its recovery tests; see
[exact source delta](backend-delta.json). Later remote changes are not covered by this frozen snapshot. No runtime source, assertion, signing manifest, live environment or
active branch was changed by this QA subtask.

| Gate | Result | Evidence |
| --- | --- | --- |
| Automatically discovered payment/signup selection, 27 files including the new pause tests | **217 passed, 0 failed, 1 skipped** | [TAP](billing.tap), [exact paths/commands/source hashes](offline-gates.json) |
| Current common profile/auth/tenant/Word-route selection, 10 files | **124 passed, 0 failed, 1 skipped** | [TAP](common-boundaries.tap), [receipt](offline-gates.json) |
| Standalone pause gate | **14/14** | [TAP](pause-gate.tap), [zero-effect assertion proof](pause-gate-proof.json) |
| Consent controller, transactional outbox and actual SDK recovery boundaries, 3 files | **33/33** | [TAP](outbox-sdk.tap), [receipt](offline-gates.json) |
| Normal-flow PostgreSQL 17 card/debt/renewal suite | **57/57**, no skips | [TAP](real-postgres.tap), [source-pinned receipt](real-postgres.json) |
| Existing protected signing source guard | **103/103**; existing manifest unchanged | [receipt](source-release-guard.json) |

The standalone 14 and real-SQL 57 overlap the 217 and must not be added as
unique coverage. The three-file outbox selection includes its eight consent-controller cases.
All final logs match their receipt hashes. Runtime/test inputs stayed stable.
The parent intentionally edited rollout/release audit documentation; no tracked
backend, test, dependency, guard or signing-manifest input was dirty or changed.

## Pause and normal behavior

The new passing tests assert zero payment-provider fetches, financial dispatch,
settlement, provisioning, billing/welcome mail and financial outbox mutations
while synthetic fixtures are paused. Existing snapshots remain read-only;
unexpired grace, expired grace and suspension keep their incumbent access
meaning. Pending/stale financial outbox rows are retained, while unrelated
nonfinancial consent work remains eligible. Native local HTTP GET/POST callbacks
return 503 and `Retry-After: 60` without acknowledging success. A synthetic replay
can reach the same handler after resume; provider retry is not guaranteed.

The runner supplies **no** `BILLING_OPERATIONS_ENABLED` value. Normal-flow
regressions and the 57 real PostgreSQL cases therefore exercise unchanged
unconfigured-enabled behavior. The paused tests set and restore the flag only
inside synthetic processes. No live pause was activated. See the precise
[operational limits](PAUSE-LIMITS.md), including old processes, already-issued
hosted pages, requests already dispatched, upstream delivery and reconciliation
before resuming. No arrears ledger or historical accounting repair is tested
or introduced by this gate.

## Dependencies, isolation and cleanup

The complete offline run and fresh SQL run held the one shared heavy-build mutex
`/tmp/layer-billing-integration-20261101/build.lock`, acquired at 22:50:23 UTC.
There was no nested mutex or concurrent heavy process started by this runner.
See [wrapper receipt](run-all-gates.json), [wrapper](run-all-gates.py) and
[reproducible SQL runner](run-real-postgres.py). The incoming common-main QA
outbound/signing-delivery changes have separate transport evidence in the
[release qualification index](../README.md); they are not an additional signing
acceptance claim by this payment report.

Node **24.14.0** reused the exact `/tmp/layer-billing-lock-deps/node_modules`
installation. All **520 installed package versions** match lock SHA256
`d36bab8fed79c2e157d1b701a71d8e3a9dee014b19a12d20bd1fe376f4c3c651`, without
required-package gaps or version drift; no dependencies were changed.
[Fresh dependency proof](dependency-proof.json).

The [runner](run-offline-gates.cjs) uses clean environment values, no billing
snapshot preload, and the existing network guard blocking external TCP/fetch
and application DB ports before connection. Provider, mail and central-service
transports are synthetic; native HTTP is confined to test servers. The SDK
retains its pinned production destination contract while its injected test
transport reaches only a loopback fixture. No application server or actual
cron/worker was started.

Only the previously owned PostgreSQL cluster `/tmp/layer-billing-pg.dJ0RrF/data`
was restarted at `127.0.0.1:55449`, fixed database `billing_card_setup_qa`, user
`billing_qa`. Fresh per-test schemas and up to eight real clients exercise the
actual locks. The additional [network guard](real-postgres-network-guard.cjs)
allows only that TCP target and blocks native fetch;
[four negative checks](real-postgres-guard-checks.json) passed before network
access. The `finally` cleanup stopped that cluster, confirmed no server and an
empty listener check. No cluster/database/role/access was created, and no other
PostgreSQL instance was touched; [cleanup](postgres-cleanup.json).

## Remaining holds

The full signup/office-policy fixture remains unavailable without its named
release database and `SIGNUP_RELEASE_QA_CONFIG`. The dedicated profile migration/
RLS PostgreSQL fixture was not supplied through `CLIENT_PROFILE_TEST_SOCKET` at
its fixed 55487/55488 socket. These are the two reported skips; no other QA
cluster was borrowed or recreated.

Actual Takbull sandbox identity, merchant document type/settings and receipt/
email delivery remain separate holds. These local results do not claim live
activation, deployed schema/ACL state, tenant runtime binding or provider
acceptance. No private customer reconciliation material was copied into Git,
and no customer DB, real charge, document, email, deployment or push occurred.
