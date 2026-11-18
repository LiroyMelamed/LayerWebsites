# Signing batch performance — 18 November 2026

The initial durable-creation target passes **within the measured server boundary**. Full preparation is still measured in minutes with R2; real notification-provider timing and browser-to-server qualification remain open. No production deployment or production tag is claimed for this change.

## Measured results

Every row uses 200 employees. Admission includes the actual HTTP draft-save and draft-submit routes, authentication, permissions, quota queries and PostgreSQL commit. Each scenario has 30 successful measured admissions, including the first, with independent committed-count checks. The isolated billing fixture is complimentary, so repeated runs do not exhaust a subscription. Initial harness setup failures (unavailable local schema, invalid draft payload, and the fixture subscription limit) are retained in the ledger/logs; they are not silently counted as passes.

| Scenario | Documents | Creation p95 | All PDFs prepared after worker start | All synthetic handoffs |
|---|---:|---:|---:|---:|
| Original scheduler, local disk | 600 | 0.985 s | 156.749 s | 156.749 s |
| Productive-loop scheduler, local disk | 600 | 0.859 s | 60.906 s | 61.952 s |
| Productive-loop scheduler, real QA R2 | 600 | 1.817 s | 128.380 s | 128.380 s |
| Productive-loop scheduler, admission only | 2,000 | 2.062 s | Not run | Not run |

For the R2 full run, confirmation-to-all-prepared was **129.205 seconds**, including that run's admission. Polling resolution is approximately one second. Each document has three pages; the full render fixture comprises 1,800 PDF pages with real Chromium-generated variable text and preserved original pages. The last 200-package run in each rendering scenario was processed through `runtime.start()`, not a test-only drain loop. Each produced exactly 200 synthetic provider calls, with no duplicate call and no failed/uncertain job.

Host: the existing three-vCPU backend VPS, schema-only isolated database, synthetic identities only; process constrained to 150% CPU, 2 GiB and low scheduling priority. Two render workers. Production processes were not restarted or reconfigured. Loopback HTTP excludes browser execution, TLS and network latency; these results do not alone establish an end-user SLA under concurrent customer load.

All 600-document and 2,000-document admissions made **68 SQL calls**, rather than queries per employee/document. The R2 and candidate-disk runs each read the source once, wrote 600 distinct prepared objects plus the synthetic source, and performed 600 hash verifications. No filled document is reused between people. `results.json` retains all admission timings, workload/boundary labels and source hashes; full reports/logs remain in the referenced local evidence directory.

## Changes and bottlenecks

- Replaced fixed worker intervals with a non-overlapping loop that immediately continues productive work and backs off only when idle. Comparable disk preparation fell by approximately **61%**.
- Added serialized lease renewal during long rendering/storage/publication waits. Fencing still prevents a stale worker publishing; ambiguous provider dispatch remains quarantined rather than automatically resent.
- Displayed provider-accepted and confirmed-delivery message counts separately from prepared documents and completed signatures. Hebrew confirmation now explicitly says documents are being prepared in the background.
- Recorded a general durable-background-work contract and a repeatable performance harness, including 200 × 10 admission.

Real R2 preparation took about 67 seconds longer than the same candidate with local disk. This is evidence that storage/publication scheduling materially contributes; it is **not** a per-stage profiler or proof that storage is the only bottleneck. Current passes wait for a complete rendering/storage group before claiming the next. Source/font caching is already active, so another source cache alone will not solve this.

Next performance work: instrument queue wait, PDF render, upload, verification and publication separately; decouple bounded I/O and PDF lanes so one slow object does not hold a whole pass; benchmark dedicated worker capacity against available CPU/RAM before increasing concurrency. Keep read-back verification and per-package isolation. Admission event-loop stalls peaked at approximately 469 ms in the R2 scenario despite meeting total latency; profile/chunk large compilation/serialization work before claiming responsiveness under competing requests.

## Verification and remaining qualification

- 4 scheduling/lease tests: no overlap or idle spin, graceful stop, lease renewal, lost lease and database errors.
- 6 real-render/source-cache tests: Hebrew, Arabic, English, rotations, overflow, sparse overlays, 40 sequential distinct PDFs without retained values, actual Chromium loss and replacement.
- 5 worker recovery tests/subtests: busy drain/shutdown, kills before/after publication, ambiguous provider handoff without duplicate resend.
- 7 persistence tests/subtests: 200 × 3 durability, retry identity, rollback on quota failure, cross-office isolation, concurrent claiming and stale-worker fencing.
- 84 frontend tests across composer/workspace, including independent document/provider/delivery counts. Existing React `act` warnings remain in the test log; suites passed.

The local recovery fixture restored all signing tables from the QA schema; unrelated `knowledge_chunks`/vector-extension objects were unavailable locally. The server benchmark used the complete schema.

Still open: real provider handoff (an approved test destination/sandbox was requested), browser/mobile responsiveness and live visual QA, repeated full-R2 preparation runs for a preparation percentile, competing workload, complex Word/mixed-source performance and full 2,000-document rendering. The 2,000-document **admission** result must not be described as a 2,000-document rendering result. Legacy signing batches and other large jobs are not certified by this benchmark. Do not publish a production performance guarantee or release tag based only on these measurements.
