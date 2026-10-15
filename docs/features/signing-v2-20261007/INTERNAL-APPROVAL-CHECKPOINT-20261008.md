# Optional internal approval checkpoint — 8 October 2026

Local work on b63f8be. This is not production approval.

Templates may require an explicitly named office reviewer before signing invitations. All real PDFs are prepared first. The named reviewer opens each PDF in the incumbent viewer and separately confirms the exact immutable document/revision hashes. Return for correction requires a reason and leaves signing blocked. A solo exception requires an explicitly published administrator policy; approval never signs a PDF. Creation batches requests and reviewer assignments. Waiting approval consumes no worker attempts. Decision and activation recheck current permission and package scope, including changes while waiting for a package lock.

Incumbent controls and Hebrew/Arabic/English are used. Large reviewer lists are searchable. Draft recovery retains the reviewer. The final review states invitations wait for internal approval. No real messages were sent.

## Focused evidence

The owner requested no repeated successful checks. Only new scenarios and two previously failed new assertions were run. Seven new backend cases pass across approval-backend01/02. Nine new UI cases pass across approval-ui02/03/04; historical tests and previously green cases were explicitly skipped. Build03 passes; lint01 has only unchanged older test assertions at NativeTemplateBuilder.test.js:235; new search files lint02 clean. Failures remain archived.

Actual browser38/8137: Hebrew1280 opens both real PDFs, explicit approval starts one fake invitation with zero signatures. Arabic390 returns a second package with a reason and no invitation. Immutable snapshots unchanged. English1280 named-reviewer search and saved-draft reload pass. Controls44px/textarea60px, RTL/LTR and no horizontal overflow. Owned server and tab closed, viewport reset.

Evidence: outputs/signing-implementation-20261007/workflow-ux-20261008/approval-* and TEST-LEDGER.md in the parent workspace. Changes to approval services/policy/creation/jobs/workflow/request migration or new approval UI invalidate their respective evidence. Historical unrelated signing/system checks are retained, not rerun.

## Remaining release gates

Immutable replacement/correction completion, remaining explicit action/projection integration, missing multiple-person Excel browser evidence, representative exact-candidate200/600+and1200realPDF performance, and focused MelamediaQA. Earlier PDF timing failure remains open. Customer deployment prohibited by AGENTS. No push, deployment or production tag.

## Rollback

Migration10 is additive and applied only to isolated local55442. Keep the feature flag off when the schema is absent. Retain new request/evidence rows and immutable approvals during rollback; do not drop audit data. No customer database or process was changed.

## Latest owner direction

Owner accepted the performance achieved so far and requested cancellation of the recurring follow-up. Automation2 was deleted in the app. No more performance optimization or repeated successful tests. Historical timing failures remain historical measurements; owner acceptance is not a newly measured pass. Final additions that focus a missing-reviewer error and propagate an operational database failure are saved but their two new tests have NOT been executed. No production approval is claimed.
