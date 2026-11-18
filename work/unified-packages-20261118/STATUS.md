# Unified document packages — 18 November 2026

Mixed Word/PDF recipes, private/office access, immutable source revisions, source-bound Word signature anchors, shared data IDs, separate data roles, common field editor, private drafts and existing signing-engine handoff implemented behind SIGNING_PACKAGE_RECIPES_ENABLED=true (default off).

Local qualification: LOCAL-QUALIFICATION.json binds source hashes to evidence logs. 70 backend tests passed, including actual supplied rental conversion/reflow 7 to 8 pages and native publish/send idempotency. 120 frontend tests passed; follow-up common editor controls are recorded separately. Build passed before the final keyboard control, which is covered by the upcoming tenant build.

Real QA browser checks, actual signer OTP/signature/completion delivery, responsive finish, production rollout, final tag and Figma remain pending. No production qualification is claimed. Historical Google/Gmail/iOS checks are not qualified by this feature suite.

QA runbook: land on main, merge main into registered Melamedia QA worktree, deploy exact backend commit with migrations 2026-11-18_01/02/03, enable SIGNING_PACKAGE_RECIPES_ENABLED only in QA, build branded Melamedia frontend, test admin and signer on marked synthetic packages. Tenant rollout only after live acceptance.

Do not overwrite original rental. Use only QA recipients and synthetic values; recipes retain no filled per-client data. Immutable preparations and native artifacts are actor-private. Shared recipe sources retain original permissions and existing private packages are unchanged.
