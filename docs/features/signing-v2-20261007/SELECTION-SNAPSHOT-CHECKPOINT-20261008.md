# Frozen-selection backend foundation — 8 October 2026

Local additive foundation after a218d07. Bulk management is still unfinished; this is not production readiness.

POST /signing-v2/selections requires the existing upload permission, an explicit mode (explicit IDs or all_matching), and an Idempotency-Key. GET /signing-v2/selections/:id is private to the authenticated creator and owner context. No default all-selection exists. Filters use the same authorized pending-management projection; names/counts from inaccessible packages cannot enter the selection.

One bounded query captures package/revision/task/profile versions from a single MVCC view. The resulting immutable snapshot expires after ten minutes. Retrying creation returns the same snapshot without extending expiry or adding new matching results. Current reads report changed task/contact/revision state; removed assignments return an exclusion without stored names or inaccessible task/person counts. The previous filter remains stored rather than silently following a later UI filter.

Selection is bounded to1000 packages/20000 tasks. It does not create deliveries, signing operations or worker jobs. The response counts describe the frozen accessible items, with requiresReview when current state differs. A snapshot is never sufficient authorization to send: the remaining bulk preview/execute/worker integration must recheck exact scopes, record exclusions, bind actual message grouping, and refuse expansion.

Evidence: outer workflow-ux-20261008/selection-snapshot-backend01/02.txt, migration01.txt and TEST-LEDGER. Fourteen unique focused backend scenarios pass including existing management scoping. Tests cover concurrency/idempotency, explicit/page versus all-filter, added-result exclusion, immutable storage, contact/task changes, permission/assignment revocation, private HTTP access, view-only403 and expiry. Two hundred packages with600 task records use7 SQL calls, equal to a3-package selection. This test creates metadata only: it is not the representative real-PDF capacity benchmark and does not establish p95 timing.

The full selection UI, reviewed aggregate messages, bulk execute/dispatch and operation recovery remain to be implemented. No new bulk action is exposed in the product UI by this checkpoint. No real messages, remoteQA migration, customer deployment, push or production tag.

Apply additive2026-10-08_07 before enabling its API. Rolling this foundation back only removes access to its unused selections; preserve the table and audit history. Once bulk operations reference snapshots, their retention/rollback must be handled with those operations. Changes to selection capture/checking, management filters/projection, access or schema invalidate affected authorization/immutability/expiry/count/query tests.
