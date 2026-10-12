# MelamedLaw / Melamedia QA — issues log

## ISSUE-2026-10-05-001 — Popups bypassed firm permissions (P0, fixed)

- **Severity:** P0 (UI showed save/update in modals; API still denied)
- **Root cause:** `PopupProvider` rendered `SimplePopUp` outside `FirmPermissionsProvider` (`frontend/src/index.js`). `CaseFullView` used `useFirmPermissions() || { canAction: () => true }`.
- **Fix:** `92398c0` / Melamedia `a834c41` — nest `PopupProvider` inside `FirmPermissionsProvider`.
- **Retest:** Role A case 275 — save button absent, `lw-caseFullView--readOnly` present (browser check on QA `main.f18ea75d.js`).

## ISSUE-2026-10-05-002 — Permission flash before session-scope (P2, fixed)

- **Severity:** P2
- **Root cause:** `canAction` / `canPage` treated `!scope` as legacy-allow.
- **Fix:** `cb47e0a` — fail closed until `loaded && scope`.

## ISSUE-2026-10-05-003 — Suites 2–3 harness false failures (TEST HARNESS, fixed)

- Wrong save label (`שמירה` vs `שמור תיק`), wrong case type string, obsolete `/staff/employees`, status filter DOM selector.
- **Fix:** `run-suites-2-3.mjs` updates; Role C uses fixture role id `330ba557-4866-43ff-a057-cc584638108b`.

## ISSUE-2026-10-05-004 — Case delete cleanup in suite (P1 open, harness/product)

- **Severity:** P1 for automated cleanup only
- **Detail:** Role B lifecycle creates case via UI; delete button not found (likely no `cases.delete` on fixture role). QA test cases may remain until PA/API cleanup.
- **Status:** OPEN — add manifest cleanup via Platform Admin API or grant delete on dedicated QA role for cleanup path only.

## ISSUE-2026-10-05-005 — AllCases status filter assertions (P2 open, harness)

- **Detail:** Filter dropdown works with new selector; list count assertions time out on `.lw-allCasesCard .lw-textBold20` for Role A assigned-only fixtures.
- **Status:** OPEN — align count helper with MyCases/assigned UI.
