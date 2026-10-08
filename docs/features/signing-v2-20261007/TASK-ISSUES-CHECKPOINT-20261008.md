# Task issues checkpoint — 8 October 2026

Local checkpoint based on cd4c92d. Not production readiness or deployment approval.

## Behavior

The incumbent SignatureCanvas offers refusal and clarification for the currently viewed PDF, limited to the recipient’s ready tasks on that PDF. A request pauses only those tasks, preserves accepted signatures and blocks later required stages. Free text remains in scoped issue records, never in operational alerts or generic events. Public grants, contact versions, active revisions and task states are checked again under locks.

Authorized office staff can respond and reopen the unchanged PDF. Task versions increase, making any old consent/verified OTP session stale. The signer must provide fresh consent and verification. A returning later-stage signer cannot be signed automatically. Pre-existing attention is restored instead of being cleared accidentally. Issue history is immutable, and both public and office writes use durable payload-bound idempotency.

The pending list preserves the current-stage explanation while a prerequisite is paused. Read-only office users cannot see sending controls. Existing platform components and he/ar/en language preference are reused; no per-recipient language setting or source PDF translation is introduced.

## Focused evidence

Outer evidence: outputs/signing-implementation-20261007/workflow-ux-20261008, with exact runs and invalidation in TEST-LEDGER.md.

- Backend02:19 unique scenarios, plus backend03 acceptance-versus-issue race. Backend04:11 unique dependent scenarios after final current-stage correction. Permission denial, scoped note privacy, task/version/grant fences, immutable issue history, idempotency, preserved signatures and fresh returning-stage consent/OTP pass.
- UI02/03:68 unique focused scenarios; UI04 refresh label and UI05 current-document office response direction rechecks pass. Lint01/02 clean; final Build06 passes.
- Actual Hebrew request→office resolution; Arabic390px clarification→office response→incumbent consent/Arabic-digit OTP→acceptance; English1280px later-stage refusal→response→fresh consent/new OTP→acceptance. Completion offers only Finish.
- task-issues-resume1-final-proof.json: two protected real two-page PDFs hash-match their final DB artifacts; three accepted tasks use distinct sessions; both issues resolved; immutable original snapshot and earlier peer acceptance unchanged.
- Final textarea direction,44px dialog controls and no overflow verified in English1280px and Arabic390px. Final notice direction verified in visual3. Office notes are preserved as authored, not translated.

## Retained failures

Backend01 bigint normalization; UI01 capability fixtures; harness setup failures; checkbox automation timeout after unmount; English textarea RTL inheritance and then CSS-specificity failure; first Save attempted before asynchronous OTP verification; Date-object versus JSON-string readback assertion. Corrected attempts and all original evidence remain. Initial Arabic notice capture was during reload and is incomplete, followed by loaded02 proof.

## Reuse and rollback

Issue/access/routes/publicSigning/management/completion/actions/schema changes invalidate dependent privacy, permissions, barriers and signing checks. Public view, incumbent hook, dialog/styles/locales changes invalidate related UI/visual checks. Grant or task-version changes require consent/OTP regression. Performance, frozen bulk management and people/capacity/authority are not approved by these tests.

Apply the additive migration before this code. Do not roll back to code unaware of clarification tasks while open issues exist: pause affected signing, preserve issue records and accepted artifacts, and resolve the migration/code compatibility before restarting workers. Never delete immutable evidence to roll back. This checkpoint contains no production tag, customer deployment, real transport test or push.
