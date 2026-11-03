# Exact approval packet: existing-QA synthetic SQL sequences

PENDING APPROVAL. Nothing uploaded, no SQL executed. The previous QA pause approval stays valid. This separate action copies test artifacts and adds temporary resource/network isolation only to test processes; it is not approval for a database restore.

Final archive: `layer-billing-sql-sequences-6a3bd299-hardened.tar.gz` (9903203 bytes).

SHA256: `10908a08142a108e63247797fd1f334e63892dc87b1d5747aa5770ff4911f7e9`.

Manifest SHA256: `a9465814bcbf84438ccf85c4cfa5c49f805a0b6008d280b9be447b5f6537d9f1`.

Approval requested: copy this verified artifact to the exact existing-QA temporary directory and run the two unchanged SQL sequence suites using synthetic in-memory PGlite only, within the named temporary test scope (2GiB, no swap, 50% of one CPU, 32 tasks, 600 seconds, group OOM kill). Enforce kernel socket restrictions including AF_UNIX, separate network namespaces, unprivileged identity, closed inherited FDs and Node read-only permissions before any SQL. Preserve evidence, then remove only this test tree after verifying no live test process. No live service, shared dependency, existing PostgreSQL/database/schema/role, customer or waived-period change, supplier request, real charge, document or message is authorized.

Impact: short bounded host CPU/RAM/disk use. Resource or guard/hash/fixture failure aborts; no weakened fallback. Return: test processes end, the temporary scope is collected, namespaces disappear, and only this artifact tree is cleaned after evidence preservation. No service data needs restoration because none changes.

# Existing-QA synthetic SQL sequence run — review-only payload

NOT UPLOADED OR EXECUTED. This is a copied test artifact for the existing QA host, not a deployed environment, PostgreSQL cluster, live schema or service. Its only proposed SQL databases are ephemeral in-memory PGlite instances within the original tests. They contain only their synthetic fixtures.

Product source is frozen at 6a3bd299227291feb0065ae3afa89a1f3ba2967a. Both original test files and seven runtime modules are unchanged. Full @electric-sql/pglite0.5.10 is copied from the already-existing locked test installation; no npm/registry/install/lifecycle operation is proposed. Do not use or modify live node_modules or .env.

After the exact temporary action is approved, stage this hash-verified archive exclusively in /tmp/layer-billing-sql-sequences-20261102-6a3bd299/payload, with root-owned files0444/directories0555 and traversable parent. Abort on an existing target, hash/mode/symlink/extra-file mismatch or uncertain prior run. Keep root0700 run outputs in the sibling /tmp/layer-billing-sql-sequences-20261102-6a3bd299/runs. Hold the existing maintenance and QA tenant locks shared for the complete operation; do not create or bypass locks.

Proposed exact resource scope (the manifest SHA must be the externally pinned final value):

```sh
/usr/bin/systemd-run --scope --collect --expand-environment=no \
 --unit=layer-billing-sql-qa-20261102-6a3bd299 \
 --property=MemoryMax=2G --property=MemorySwapMax=0 \
 --property=TasksMax=32 --property=CPUQuota=50% \
 --property=RuntimeMaxSec=600 --property=OOMPolicy=kill \
 /usr/bin/python3 -I -S \
 /tmp/layer-billing-sql-sequences-20261102-6a3bd299/payload/qa_sql_controller.py \
 --approved-execution \
 --bundle /tmp/layer-billing-sql-sequences-20261102-6a3bd299/payload \
 --run-root /tmp/layer-billing-sql-sequences-20261102-6a3bd299/runs \
 --unit layer-billing-sql-qa-20261102-6a3bd299 \
 --manifest-sha a9465814bcbf84438ccf85c4cfa5c49f805a0b6008d280b9be447b5f6537d9f1
```

The approval switch does not itself grant authorization. The controller requires the actual 2GiB/no-swap/32task/50%CPU/600s/group-OOM scope before SQL and verifies source/PID/daemon/boot/environment/dependency fingerprints. No approved scope or any failed prerequisite means no SQL; never weaken a boundary as fallback.

Each of the two unchanged selected files runs serially in its own anonymous network namespace through linux_sql_sandbox.py. Before Node, the launcher verifies the pinned existing Node/libseccomp, drops to existing nobody65534, drops groups/capabilities, sets no-new-privileges/parent-death SIGKILL, closes all inherited descriptors except /dev/null and regular logs, and applies a kernel all-socket-family deny filter, including pathname Unix sockets and namespace/process escape controls. Only invalid/nonconnecting negative canaries run before Node. Node additionally requires read-only artifact permissions, no addons/worker/child/write permissions, clean six-key synthetic env, BILLING_TEST_POSTGRES=0 and strict-test-guard.cjs. The native pg/config/db/ws/SMTP/application imports are rejected. All payment/document/mail/Central/signup boundaries in the original fixtures are fake.

The per-file harness retains all original assertions, four JS canaries and final zero-forbidden-operation checks. Success requires both non-skipped TAP groups, exit0, kernel readiness proofs, zero forbidden counters, unchanged artifacts and unchanged live QA identity. A memory/time/import/file/network/fixture/hash failure stops the operation. PGlite SQL does not establish real-server multi-connection advisory/row locking, full signup provisioning, provider sandbox document issuance/email delivery or deployment approval.

After preserving synthetic logs, manifest and receipts, verify the test scope/processes have ended, then remove only this exact temporary artifact tree. The transient scope is collected and anonymous namespaces end with their processes; no live configuration/dependency/data restoration is needed. An interrupted SSH run is uncertain: inspect the same target, scope and receipts before any retry; do not overwrite or delete an uncertain run. No change to QA service/PM2/live PostgreSQL/customer records or the excluded waived customer period is part of this action. No real charge, supplier document, mail or message is authorized.

The resource scope is standard transient systemd255 process control; no permanent unit/service configuration is written. Primary syntax reference: https://www.freedesktop.org/software/systemd/man/255/systemd.scope.html .
