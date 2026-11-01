# Frontend evidence persistence after reconnection

Result: **PASS**. No evidence corruption or lost temporary artifact cache was
found. This was a read-only inspection, with no application test or compile
rerun and no new refs, network access, dependency mutation, product/HEAD change,
provider operation or deployment.

The frozen common runtime is `6a3bd299227291feb0065ae3afa89a1f3ba2967a`,
with upstream cutoff `074df7520497a0cd6bd95ad70353201c905f0aa6`. Both were
checked against the persisted freeze record; no remote ref was refreshed.

| Scope | Persisted frontend result | Actual compiled files verified | Latest qualified runtime |
| --- | ---: | ---: | --- |
| Common main | 920 tests / 107 suites | 253 / 253 | `6a3bd299` via equivalent-input proof |
| Melamedia QA | 960 tests / 112 suites | 256 / 256 | `efe1ee37` |
| MelamedLaw | 938 tests / 110 suites | 253 / 253 | `21d51f57` |
| MorLevi | 923 tests / 108 suites | 253 / 253 | `b05d66f9` |
| AshrafEssa | 923 tests / 108 suites | 255 / 255 | `9eaebbdb` |

These are separate, overlapping scopes, not unique test totals. All persisted
successful frontend results have zero failures or pending tests. The original
actual main execution remains pinned to `9dd9cb36`; client execution commits
also remain distinct from their later qualified runtime commits.

The inspection verified:

- Main 920-test / 253-file receipts, Jest result and discovery proof, both raw
  log SHA256 values, and the preserved 6fab2887 and 6a3bd299 provenance records.
- Every client's receipt/log SHA256, final 074 source cutoffs and donor/client
  ancestry, source-input maps and Git trees, ten imported backend helper files,
  package inputs, and carry-receipt hashes. Carry evidence still means equivalent
  inputs, not fresh execution at the later runtime candidate.
- All **1,270 expected compiled-file occurrences** across the five build folders
  against their recorded SHA256 values, with no missing or mismatched files.
  Own-tenant compiled logos match the corresponding qualified source.
- Retained source archive hashes, frozen compiler wrappers and installed
  dependency lock hashes. All remain present and match their receipts.
- Evidence bytes and common HEAD were unchanged during this inspection. Only
  this new persistence evidence folder was written.

[Detailed persistence proof](persistence-proof.json) contains full candidate
SHAs, per-scope results, artifact paths, hash checks and the exact evidence-file
hash inventory. [Read-only reproduction script](verify-persistence.py).

No old QA or provider/environment hold is removed by file persistence. These
compiled outputs retain their original synthetic QA configuration and must not
be relabeled as deployment payloads. Git staging of ignored raw logs remains
the root collector's separate responsibility.
