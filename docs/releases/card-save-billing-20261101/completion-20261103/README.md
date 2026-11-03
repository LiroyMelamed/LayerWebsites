# Billing release completion — 3 November 2026

The authorized release completed in order **Melamedia QA → AshrafEssa → MelamedLaw → MorLevi**. All four backends and frontends were published. Idm remains excluded. No intentional provider operation, test charge, fiscal document, email or SMS was initiated. Existing production behavior remains enabled as it was before publication; this is not a claim that routine customer activity was disabled.

The [Hebrew implementation and operating guide](IMPLEMENTATION.he.md) describes the final behavior. This completion report supersedes the current-status/HOLD wording in historical planning documents; their actual receipts and limitations remain historical evidence.

## Exact deployed versions

| Target | Backend source | Frontend main bundle | Backend / frontend completion UTC |
| --- | --- | --- | --- |
| Melamedia QA | `8d897c207d6bd30fdee108a52e0eb3b89f025f03` | `main.4fac0bab.js` | 10:54:09 / 10:57:15 |
| AshrafEssa | `bb43a7efa687403576b53c3c331b37e7c673f52f` | `main.70cbd7b3.js` | 11:13:13 / 11:21:56 |
| MelamedLaw | `054de1ce94f9937e4694e11ac864690c32c6789b` | `main.811b5597.js` | 11:26:43 / 11:33:08 |
| MorLevi | `4626da74b64ad4189f8a71515c1bc04ba45378cd` | `main.bc38222f.js` | 11:34:17 / 11:34:51 |

The shared runtime is `6a3bd299227291feb0065ae3afa89a1f3ba2967a`, which includes upstream `074df7520497a0cd6bd95ad70353201c905f0aa6`. Later common audit commits only change documentation. All five remote branch preimages were fetched and rechecked on 3 November before the fast-forward publication. Dedicated-client branding, configuration and existing history are preserved by their individual delivery commits. Source bundles and real-API frontend artifacts were recovered from the Mac transfer with checksum verification; synthetic-API qualification builds were not deployed.

Release tags: `PROD_03_11_2026_BILLING_CARD_SAVE` on the shared completion commit, plus `_Melamedia`, `_AshrafEssa`, `_MelamedLaw` and `_MorLevi` on the exact deployed sources above. The sanitized [deployment receipt](deployment.json) records operational completion independently of Git tag publication.

## Verification reused, not repeated

Previously completed application tests and compiler outputs were carried forward using exact input/source equivalence. The existing qualification reports retain actual execution commits, failed first attempts and reruns; this report does not relabel them as fresh tests at a delivery or documentation commit.

- Billing 217, common/profile/Word 124 and transport 40 passed at the frozen common source and client qualifications. Fixture-dependent skips remain explicitly described in [qualification](../release-qualification/README.md).
- Frontend: common 920, QA 960, Ashraf 923, Melamed 938 and Mor 923; real tenant API builds are individually pinned.
- Native PostgreSQL billing coverage: 57 previously passed. The later final PGlite run passed 79 (57 retained plus 22 self-service cases), no failures/skips; it does not substitute for native concurrency proof.
- Existing signing-source guards and the earlier operational/transport qualifications were reused. Counts overlap and are not summed as unique tests.

Only new operator behavior was tested on Windows: 22 QA transition cases, 15 normal-backend/frontend handoff cases, 48 production financial/PM2 cases, three metadata-contract cases, five stopped-session drain cases plus two recovered-process binding checks, one large-script/binary-stdin transport case, and 14 FTPS publication cases plus five read-reconnect deltas. The FTPS failure fixtures prove refusal on stale entrypoints, immutable collisions, concurrent protected-file changes, interrupted upload, partial entrypoint replacement and HTTPS mismatch. Mutating FTP commands are never automatically replayed.

Actual deployment checks then verified named process identity, source HEAD, health, original behavior flags, protected configuration/dependency hashes and unchanged observed financial/worker row groups. Each frontend has exact index/manifest readback, retained old chunks and browser rendering. QA's authenticated PlanUsage screen rendered; production login pages rendered with the expected main bundles and no console errors. No OTP or payment control was activated.

## Data and operational boundaries

No migration, backfill, database replacement, permission grant, retroactive collection or manual customer repair was performed. The deployment preserved the configured price/date/card/paid fields and owner-waived periods, including Liav's gifted November. Only accurate `GIT_SHA` process markers were added; existing behavior flags and environment files were retained. No global PM2 save/restart or generic deploy script ran.

All production data observations used the application's configured DB identity and read-only transactions. Some signup/integration table SELECT privileges are absent in Ashraf/Mor; no alternate role or new grant was used. The changed billing groups were readable and compared. This is not an assertion that inaccessible unrelated tables were audited.

Existing backup-health reports recorded verified offsite readback for the named tenants. The prior QA logical restore proof was reused; no new production restore was executed. Three distinct backend Git source archives were saved per deployment, with full archive readback. Shared-VPS frontends have private checkpoints. The separate MelamedLaw FTPS host has a verified local checkpoint of 217 published runtime/root files (18,100,641 uncompressed bytes); 14 already-absent optional source maps are explicitly recorded. It is one current recoverable runtime snapshot, not a claim of three certified inactive full frontend releases. Existing root configuration/branding was preserved, only script/style entrypoints changed, and old chunks were retained.

## Retained interruptions and recovery

1. QA cycle 4 failed during the normal-return handoff. Its actual HOLD and baseline recovery remain retained. Cycle 5 bound a new observed baseline, fixed the producer/consumer process identity contract and completed within its own original window; the old deadline was not extended or reused.
2. The first Ashraf frontend handoff failed during read-only SSH readiness, before remote publication. A Windows command-length failure also happened before the SSH process could launch. The repaired stdin transport was tested, then a fresh readiness proof and successful publication were recorded.
3. Melamed's first backend stop left one transient idle DB session visible. All financial/worker values matched; no source changed. The original backend was restored and healthy at 11:24:01 UTC. A new immutable package, bound to that recovered process, added a bounded wait for zero sessions while still requiring identical financial rows and no active transactions. It completed successfully; the original HOLD was not rewritten.
4. Melamed's FTPS checkpoint initially encountered already-absent source maps and a closed read connection. Optional maps were distinguished from runtime files; bounded reconnects apply only to reads/listings. The successful checkpoint and publication used CA/hostname-validated TLS. No TLS check was disabled for authenticated transfer; a credential-free certificate inspection identified the hosting hostname for the existing configured IP.

The real-provider payment/document/email end-to-end flow was intentionally not executed. Two historical full signup/profile environment-specific fixtures remain outside this execution. Receipt links do not establish email delivery. No claim is made that PGlite proves every native lock timing or that browser login rendering exercises authenticated production billing actions.

## Evidence

[deployment.json](deployment.json) contains sanitized actual completion receipts and browser observations. [evidence-manifest.json](evidence-manifest.json) pins the retained operator/test artifacts. Operational source and qualification deltas are included under `operators/` and `qualification/`; private snapshots, environment files, payment/customer details, archives and credentials remain outside Git. The original Mac application qualifications remain in their existing release directories.
