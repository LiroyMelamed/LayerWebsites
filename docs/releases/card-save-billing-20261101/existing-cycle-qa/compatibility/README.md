# Existing-cycle billing patch: final offline compatibility

Captured 2026-11-01T21:55:44.359455+00:00.
Current shared-main base: `e3ab31d3ef6ee94d375eaf5df5bdf57d2c14715a`.
Candidate HEAD: `c21c897b00fb3a969bd977d62615e6325879a1fc`; uncommitted selected input paths at capture are listed below.

Patch input: [billing-application-tests.patch](billing-application-tests.patch), 206710 bytes.
SHA256: `08391d921d4f5c85071705be571c96dff3204565f1d40b4d368e320194403258`.

The patch contains **24 focused paths: 12 application/locale paths and 12 test paths**. It excludes documentation and unrelated common-main work. Current main's shared profile/Word work remains in the base; no multi-month billing implementation is introduced by this follow-up.

Uncommitted application paths: [].
Uncommitted final test paths: `backend/tests/cardSetupDebtCollection.test.js`, `backend/tests/selfServiceCardSetupCollection.test.js`.
All 24 file hashes stable during check: **True**.

| Target | Immutable source SHA | Archived existing files | New test paths left absent | git apply --check |
| --- | --- | ---: | ---: | --- |
| main | `e3ab31d3ef6ee94d375eaf5df5bdf57d2c14715a` | 19 | 5 | PASS_CONTEXT_COMPATIBLE |
| AshrafEssa | `ab271c535a996e5db4bcfc333c3b60dd332c3781` | 19 | 5 | PASS_CONTEXT_COMPATIBLE |
| MelamedLaw | `5f3a4459256c225be14386178e3cec827e3c79e2` | 19 | 5 | FAIL_CONTEXT_INCOMPATIBLE |
| MorLevi | `08f1a9889274b035d9bc307337563ad8c7016cb8` | 19 | 5 | PASS_CONTEXT_COMPATIBLE |
| Melamedia | `ca31b04ea2957e78eb7f57edcff468baa6e6332d` | 19 | 5 | PASS_CONTEXT_COMPATIBLE |

Only selected paths already present at each target were exported with `git archive` to isolated `/tmp` directories. New test files were deliberately absent so the patch's file-creation context was checked correctly. `git apply --check` ran only; no patch was applied. Temporary exports were removed.

**Nine production billing JavaScript baseline files match shared main on all four client/QA targets.** Exact blobs are recorded in the JSON; this is a source comparison, not a new running-server observation.

**MelamedLaw requires locale reconciliation before the complete patch can be applied.** Its `ar.json`, `en.json` and `he.json` parse to exactly the same JSON objects as shared main, but their key ordering differs. The billing patch adds only `billing.paymentUnconfirmed` in each locale; existing values are unchanged. A diagnostic `git apply --check` excluding those three paths passes on MelamedLaw, so the remaining 21 application/test paths have compatible context. Exact failure output, billing key order and intended value hashes are recorded in the JSON.

A separate [Melamed-specific review patch](MELAMED-ADAPTED.md) now supplies the three surgical locale additions and records its own passing check plus disposable-export application/byte verification. The shared patch above remains 4/5. No real source checkout or customer change was performed. Functional integration/release checks remain separate.

**Context compatibility is not functional qualification.** No new all-client application test, browser flow, provider/receipt test, migration/grant check or deployment was performed. Existing functional/source-guard receipts remain separate evidence. Current tenant pins came from the parent's refreshed GitHub observation, not the earlier historical version audit.

A changed application/test input, shared-main base or target pin invalidates this proof. The parent can bind the final committed candidate to these hashes after committing the stable test-only edits, or rerun this script if any bytes change.

[Machine evidence](compatibility.json) · [Reproduction script](check-compatibility.py)
