# Signing UX checkpoint — 8 October 2026

Not production-ready. No deployment or production tag belongs to this checkpoint.

## Implemented
- A selected template opens recipients directly, with exact-version validation.
- Existing Excel files have explicit column mapping and preview before replacing recipients.
- Per-send role audiences distinguish one shared person from one person per package.
- Back controls reuse the existing tertiary button, with direction-aware arrows and44px targets.
- Mobile choice groups wrap inside cards; English signing-order labels no longer fall back to Hebrew.
- A saved case can be selected in the composer or opened from the case editor. People are assigned explicitly; no signing authority is inferred and no case/client record is changed.
- Case permission is rechecked before preview, before directory creation and in submission persistence.
- Returning from signing preserves unsaved case-editor fields.
- Open run selects the exact new submission and expands its packages, with scoped server filtering.
- Shared search suggestions support pointer and keyboard activation without duplicate selection.

## Evidence and reuse
Authoritative append-only ledger outside the product worktree:
`outputs/signing-implementation-20261007/TEST-LEDGER.md` in the owning workspace.
Evidence directory: `outputs/signing-implementation-20261007/workflow-ux-20261008`.

Latest case slice: `backend-case-final-01.log`11/11; `ui-case-final-01.log`41/41. These results predate only optional Back label text. `lint-case-final-01.log` covers final sources. Browser evidence `case-review-en.png` and `case-editor-unsaved-preserved.png`; the latter proves the actual case editor preserved an unsaved edit. The case search selection race was caught in the browser, fixed, and covered by the actual SearchInput test. Both failed and successful test logs are preserved. All data, providers and object storage in these checks are isolated/synthetic; no real messages.

Earlier direct-entry/import/audience evidence is in the same ledger. It is not blanket approval of subsequent changes: rerun only tests whose listed source dependencies changed, and still cover new or previously untested behavior. Source SHA256 manifests identify checkpoint content.

## Remaining release gates
Full F1 is incomplete: durable editable drafts; multiple people/capacities/authority and mixed stage groups; full frozen bulk management; decline/clarification and signed-copy delivery;600+ PDF signer scope; crash/restart/dedupe; representative creation p95<=5s, PDF readiness and provider acceptance measured separately; exact-candidate local and remote QA. Native checks were waived in favor of responsive browser checks. Real outbound test sends remain prohibited. Never infer public availability or production approval from a local UI pass.

## Bounded consent groups (local checkpoint)

The approved per-session budget remains200 tasks. More than200 ready PDFs now offer explicit counted groups, keeping every ready role of a PDF together. Moving to another group reloads readiness and creates a new consent/OTP session. Future-stage tasks never join a frozen selection. Group completion states how many remain; only Finish appears after the last ready document.

Acceptance advances affected packages with bounded SQL reads/job writes instead of a query loop per package. Progression200-package dedupe and existing real-PDF/later-stage regressions passed (3/3). UI/adapter/real Canvas focused suites28/28. Browser signed201 real PDFs in200+1 with two fresh codes, Arabic digits and separate drawing, and only Finish at the end. The final copy-only adjustment is unit verified; browser copy confirmation remains pending.

Volume proof still open: first600-PDF run reached600 final PDFs/200 complete packages then failed a test's wrong job-state label. Corrected run timed out300s; preparation283s under concurrent local QA/build load. Profiling run in progress. This checkpoint is not production approval. Source/evidence and failures are recorded in the external TEST-LEDGER; no customer deployment.
