# Signing packages v2 — implementation checkpoint, 7 October 2026

Status: **in development; not production ready**. This checkpoint implements part of the approved F1 specification. It is not a replacement or reduction of that specification. No v2 HTTP route or production worker has been registered, and no live data or outbound providers have been touched.

## Implemented and verified

- Additive, rerunnable PostgreSQL schema for owner contexts, people, parties, corporate authority, published template versions, package revisions, participation-bound tasks/actions, scoped delivery profiles/grants, operations, durable jobs, selections and events. Composite foreign keys retain the office boundary. Published templates, authorized revision content, ready artifacts and accepted events cannot be silently overwritten.
- Explicit person creation; shared phone/email never merges people. Draft autosave uses optimistic concurrency. Published versions are immutable. Legacy template routes exclude v2 definitions. Restricted people lookup and template editing are checked separately from all-office viewing.
- Bounded definition compiler: exact identifiers/decimals, explicit dates, declarative conditions, authored optional-role treatment, informational annexes, per-document/person obligations, sequential parallel stages, distinct named corporate representatives and authority checks. Alternative quorum rules remain disabled.
- Set-based durable creation of 200 packages with document/task snapshots, separate delivery intents, preparation/validation/activation jobs and dependencies. A receipt is explicitly `durable_creation`, not a claim that PDFs or provider delivery are complete. A transactional quota adapter is mandatory and the production adapter is still outstanding.
- Leased PostgreSQL work claiming with fencing, retry limits, dependency checks and office interleaving. An expired dispatch lease becomes uncertain rather than automatically resending. Result publication checks the fence in the same transaction as the artifact/document update.
- Worker-thread PDF preparation using real Chromium and pdf-lib, bounded queue/bytes/concurrency, immutable source-only cache, fresh personal PDF state, embedded Hebrew/Arabic fonts, visible overflow rejection and existing 800-grid geometry. Four rotations and CropBox retain position. Signature acceptance/final evidence generation are not yet connected to this path.

## Focused evidence

The `foundation-candidate.log` run contains **56 passing tests, no failures or skips**. It includes the new compiler, PostgreSQL persistence/authoring/worker checks, legacy template/OTP integration, and existing geometry regression tests. This is not system-wide QA or full F1 acceptance.

The local creation test durably stored 200 packages, 600 documents/tasks and 1,200 initial jobs in **20 database roundtrips**. The candidate run took about **183 ms** with other tests running. This is one local sample with an injected synthetic quota adapter; it excludes HTTP, real object storage and actual provider dispatch. It is **not p95**, not representative infrastructure, and not the requested release performance proof.

The multilingual PDF probe covers four rotations (0/90/180/270), a nonzero CropBox, leading-zero IDs, English/Hebrew/Arabic, overflow and separation between two people. The largest measured English text anchor deviation was approximately **0.00000235 points**. This is not new native signature-placement evidence. PDF source/outputs/hashes and failed earlier probes are retained in the task output directory.

## Failures found and corrected

1. A concurrent job-claim probe found stale eligibility after another worker's commit. The locked row now rechecks claimable state; stale workers cannot publish results.
2. Early multilingual rendering used a fixed line height that cut into the font's metrics. Font-native line metrics now drive layout and overflow measurement.
3. A visual review found scale distortion because the geometry helper's visual dimensions are already normalized to width 800. The renderer now converts once, embeds at unit scale and accounts for Chromium paper rounding without stretching content. An explicit <0.01-point anchor assertion catches the defect.
4. The variable Arabic font rendered visibly but produced null Unicode mappings in extracted PDF text. The bundled static Noto Sans Arabic font passes shaping, complete normalized letter content and no-null text assertions. Font source hashes and SIL OFL license are included.

## Remaining release gates

The complete approved F1 still requires the production quota/settings/permission adapters; source registration and import/preview flows; full authority/internal approval lifecycle; exact-manifest OTP and signature acceptance; legacy route guards for v2 files; stage/final/evidence processing; grants and recipient-specific exports; delivery/reconciliation/correction/cancellation; pending-signature projections and frozen bulk selections; incumbent UI and he/ar/en translations; native flow testing; and 100-run representative 200×3/200×6 performance, crash and capacity acceptance. No readiness approval or production tag is justified yet.

No test SMS, email or push is permitted. The old release/store automation remains paused. Continue on the existing feature branch and attached draft PR20, testing changed areas and their dependencies only.
