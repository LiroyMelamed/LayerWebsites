# Bulk work performance contract

## Signing acceptance boundary

Initial SLO: p95 ≤ 5,000 ms from the user's confirmation to **committed creation of all 200 packages and every rendering and delivery job**. Include a pending draft flush in this boundary. A 202 acknowledgement, a submission header alone, or a memory-only queue is not completion. The test must verify committed rows from a separate connection after the response.

Measure three separate clocks from confirmation:

1. All packages, document snapshots, signing tasks, delivery intents and dependency jobs committed.
2. Every included document has a verified prepared artifact and is ready for the applicable review/signing step.
3. Every required initial invitation has been handed to the provider with a recorded accepted outcome. Provider acceptance is not inbox/device delivery. Rejected, unknown and blocked outcomes must remain visible; an unknown provider outcome must not be blindly retried.

The creation SLO is **not** a promise that hundreds of PDFs or provider handoffs finish in five seconds. Publish all three measurements, workload, environment and substitutions. Missing measurements remain unverified.

## Budgets across the stack

The V2 admission/compiler has separate limits: 200 packages, 10 documents per package, 2,000 total documents, 8 participants per package, 150 fields per document, 200 MB unique source bytes, 50,000 output pages, 2 GB estimated output bytes and 8 MB aggregate snapshots. Per-source limits also apply (20 MB, 500 pages). These are admission ceilings, **not certified performance for their simultaneous worst case**. Drafts additionally have a 1 MB serialized-input budget. Reject an oversized workload before partially creating it; do not raise the UI count alone.

Minimum performance fixture: 200 employees × 3 documents. Also exercise 200 × 10 for database admission. Record pages, field counts, source sizes, Word conversion and signature participants; a simple PDF fixture does not qualify complex Word conversion. Large per-signer task selections have their own pagination/consent budget; do not silently expand the 200-task review limit to the entire run.

## Implementation invariants

- Use `creation/drafts/:id/submit` for the current composer, with its draft/version and idempotency contract. The fallback `creation` path shares the same transaction. Existing legacy batch code has different performance characteristics and is **not covered** by a V2 benchmark.
- Resolve people, authorities, clients, cases and source metadata in sets. Persist package/revision/document/task/profile/delivery/job/dependency arrays with set-based inserts. No rendering, storage copy or provider call inside admission.
- Quota reservation and the durable submission share a transaction and office lock. Stable request identity and unique job keys prevent duplicates. Keep expected-version checks and tenant scoping.
- Render in bounded worker threads. Do not put Chromium/PDF work on the API event loop. Keep bounded queue length and byte budgets, not merely a worker count. Begin with two renderers on the current shared three-vCPU server; increasing workers requires CPU/RAM measurement.
- Immutable source bytes and fonts can be cached by tenant, source version and content hash. Mutable PDF objects, overlays, filled values and output files belong to one package. Cache reads must not expose a mutable shared buffer.
- A worker drains available backlog without a fixed polling sleep after each productive pass. Idle polling remains delayed and passes never overlap. Long rendering renews its fenced lease. Lost leases cannot publish outputs; process death leaves durable work recoverable.
- Progress is derived from committed artifacts and delivery outcomes, not attempted jobs or browser timers. Leaving a screen must not cancel the run. Reopening reads the same durable submission. “Created”, “preparing”, “ready”, “provider accepted”, “delivered”, “failed” and “unknown” must not collapse into “sent”.

## Reproducible benchmark

`backend/scripts/bench-signing-v2-batch.js` requires `LEGAL_DB_QA=true`, a loopback/socket DB host, a non-production process, and an isolated `signing_perf_qa_*` database (or the designated local test DB). Use a **schema-only** clone, never customer rows. It creates a synthetic complimentary billing fixture; do not run it in a real tenant database. Keep workers and notifications disabled except the explicit benchmark runtime.

The harness uses the actual Express signing router, authentication, permissions, quota adapter, draft save and submit, PostgreSQL, worker scheduler, Chromium and pdf-lib. It measures 30 sequential admissions by default (`BENCH_RUNS`), validates 200 packages and all document/render/delivery counts after each response, retries the last submission to verify reuse, and renders the last run. Earlier synthetic runs are cancelled only inside the isolated test context so they do not multiply rendering work.

Options: `BENCH_DOCUMENTS=3|...|10`, `BENCH_RENDER=false` for admission-only tests, `BENCH_OUTPUT`, `BENCH_COMMIT`, and normal DB/Chromium environment variables. Read `report.json`, including its explicit boundary labels. Local disk and a 100 ms **synthetic** delivery adapter are used: this is not R2 or real-provider proof. Timings include the actual worker startup and idle behavior; they do not use a test-only drain loop.

Qualification still requires browser-to-server timing, UI responsiveness on desktop/mobile, real storage, an approved provider test/sandbox, representative concurrent API traffic, restart/recovery, cross-package privacy checks and repeated full-preparation runs. Record p50/p95/max, query counts, event-loop stalls, CPU/RAM, queue depth, errors and retries. Keep cold-start results separate and never discard unsuccessful runs from the report.

## General large-work rule

Apply the same durable admission + bounded background processing pattern to imports, bulk document requests, reminders, exports and other long operations. Each feature must define its own workload and three completion boundaries before implementation. Require stable retry identity, tenant isolation, recoverable checkpoints, truthful partial progress, workload budgets, cancellation semantics and an empty-queue backoff. `lib/background/workLoop.js` supplies the non-overlapping productive/idle scheduling primitive; it does not replace a persistent queue or provide idempotency by itself.

Audit legacy serial flows separately before migrating them. Do not declare all background work optimized because the signing path meets its creation SLO.
