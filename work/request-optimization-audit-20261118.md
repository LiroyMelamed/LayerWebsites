# Request amplification audit — 18 November 2026

Follow-up to the office loading incident (product hotfix `16be51d3`). This is a focused audit of request initiation, hidden components, polling and list loading, not a claim that every performance path was benchmarked.

## Confirmed and fixed

| Area | Before | Change |
| --- | --- | --- |
| Signing manager | Automatic file request plus explicit scope effect; legacy list also fetched behind templates, tracking and stage panels | One scoped list read when the list is visible; closing a panel relies on the same effect |
| Reminders | Auto hook plus effect queried the same list on entry, page and filter changes | Remove duplicate effect; mutations retain explicit refresh |
| Calendar event form | Initial staff auto-search plus redundant new-event effect | One initial staff search; interactive search unchanged |
| Signing tracking / participant summary | Every 8-second tick started another read even when the prior read was unfinished; latest-wins could indefinitely discard slow results | Single pending read per resource; 30-second read timeout; cancellation on query change/unmount preserved |
| Permission scope | Focus, visibility, route and timer could concurrently read the same session | Coalesce only outstanding requests for the same token; token changes start a fresh read; denial remains fail-closed |
| Permission and billing periodic refresh | Ran while tab hidden (one per 60 / 30 seconds) | Pause periodic reads while hidden; immediate check on visibility return; auth and billing-lock events still handled |

No global API cache, permission relaxation, write retry, backend restart, schema change or rate-limit increase.

## Confirmed follow-up (not implemented in this patch)

Case lists call `casesApi.getAllCases` without pagination (`frontend/src/api/casesApi.js`). `allCasesScreen/AllCasesScreen.js` filters the entire loaded list locally and derives filter choices from it. `backend/controllers/caseController.js` supports opt-in case-ID pagination, but the unpaginated route retrieves all permitted cases plus stage descriptions. Payload and DOM work therefore scale with the full office history.

Next change must implement server-side filtering/search, counts/filter choices and pagination together, then load stage detail on expansion. Adding a limit alone would silently hide matching cases and invalidate filters. No arbitrary cap was introduced.

## Reviewed safeguards

Calendar request-key deduplication, debounce and visible-only polling already exist. Firm-settings reads already share a pending promise and skip hidden polling. Case users / event managers are fetched in bulk rather than once per row. Existing collapsed-case timeline guard and case/document-request coalescing are retained.

## Evidence / limits

`optimization-final-regressions.log` in `/Users/liroymelamed/.cache/melamedia-builds/document-workflow-20261117`: 71 tests in 10 suites passed, including request counts, 24-second deferred responses, identity isolation, startup token rotation, permission-denial clearing and the original case-loading regressions. Earlier attempts failed due to an incomplete i18n test double in the added stage-panel test; the final run passes. Existing React test warnings remain.

Live QA and rollout will be recorded below; automated component tests are not a production load test.

## Live QA and release

Product `edffa386`; QA frontend `ca57a9e8`. Authenticated QA verified list entry, direct template reload, return to list, reminders/filter, new-event open/close, tracking and participant summary. Nginx snapshots show exactly one legacy-file read on entry and no extra legacy read on template reload; one reminders read per entry/filter; reopening the calendar form increments the staff-read count by one. Tracking and summary finish loading. Sampled responses were 200/304, with no 429. No invitations or saved records were created by this verification.

Main component regression: 71/71. Melamed merged regression: 75/75, retaining four pre-existing tenant capability tests while resolving an append-only test conflict. Source files changed by this patch are identical between QA and client branches.

Frontend releases:
- QA: `ca57a9e8` (`main.d42f998a.js`)
- MelamedLaw: `7cf0bb5b` (`main.099ef26b.js`)
- AshrafEssa: `64a7e24d` (`main.39b558e5.js`)
- MorLevi: `9d2199bb` (`main.d2f5db67.js`)

All four sites' public HTTPS manifests and entrypoint bytes match their builds (`optimization-production-https.log`, `request-optimization-20261118/https-proof.json`). Post-deploy authenticated browser smoke: Melamed signing list loaded (0 pending, 3 signed); Ashraf reminders loaded with pagination (44); Mor reminders loaded its empty state. Existing root branding and old immutable chunks were preserved. Backends and customer data were unchanged. Tag: `production-request-optimization-20261118` on product commit.

Evidence directory: `/Users/liroymelamed/.cache/melamedia-builds/document-workflow-20261117/request-optimization-20261118`. Includes sanitized request counts, QA screenshots, publication receipts and rollback entrypoints. No native-device run or full signing/send end-to-end is claimed for this request-only patch. Slow-response and identity-race proof comes from automated tests, not artificially throttled production traffic.
