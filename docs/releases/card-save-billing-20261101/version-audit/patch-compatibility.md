# Current production patch context compatibility

Captured 2026-11-01T13:49:02.401909+00:00. Patch baseline: local `origin/main` at `047567a84101a6afc90fc36a84f5fd860ea24320`.
Fresh GitHub main target: `53d177eea8bcdcb882ade913f4afa15c6011da4b`; it is checked independently below, without moving the local tracking ref.
Task HEAD at capture: `446aff92546f11280b5a8ff053676833ea86cd74`; all twelve production inputs are committed at that source point.

Input: [`compatibility-production.patch`](compatibility-production.patch), 85637 bytes.
SHA256: `f267ca948bb2fed2ba7894bdeac2d83026d43da3a4d1b69c0f256413333973b0`.
The twelve working source files stayed unchanged during the check: **True**.

| Target | Immutable source commit | Exported source/locale files | git apply --check |
| --- | --- | ---: | --- |
| main | `53d177eea8bcdcb882ade913f4afa15c6011da4b` | 12 | PASS_CONTEXT_COMPATIBLE |
| AshrafEssa | `c469ee2e0fb5bee403902c698f6621cb7a08cab3` | 12 | PASS_CONTEXT_COMPATIBLE |
| MelamedLaw | `0631caf7b1c829673887e12c1d2e3ffc36c1715b` | 12 | PASS_CONTEXT_COMPATIBLE |
| MorLevi | `a50afb3fccaaee17633328ef62b5695336d73090` | 12 | PASS_CONTEXT_COMPATIBLE |
| Melamedia | `36c95fa0da76281b4fe92c8cb687d33332a5e8c8` | 12 | PASS_CONTEXT_COMPATIBLE |

Exactly the nine production JavaScript files and Hebrew/English/Arabic locale files were exported with `git archive` to isolated `/tmp` directories. Only `git apply --check` ran; no patch was applied. Temporary exports were removed after checking.

**This proves patch-context compatibility only.** It is not a merge, tenant runtime test, schema/grant verification, branded build, provider test, deployment or release approval. Full locale files and tenant-specific state were not replaced.

Any subsequent change to the twelve production files or the main/tenant inputs invalidates this result; regenerate the patch and rerun this script after the final billing candidate is committed.

Exact source hashes, commands, exit codes and archive hashes: [`patch-compatibility.json`](patch-compatibility.json).
