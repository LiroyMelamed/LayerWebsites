# Manager home release — validation ledger

Already successful tests are retained; only failed scenarios, changed code and tenant deployment differences are checked again, as requested by the owner.

- Prior adviser release: 63 backend and 8 frontend feature scenarios passed, plus Melamedia browser smoke and production build (source 08f94727, QA b67e2109).
- Frontend: 554 unique scenarios now passed. Latest full run: 527 passed; failed-only delta:24 passed; final failed-only delta:3 passed. The latter runs intentionally skip unrelated names.
- Backend unit baseline:513 passed; failed-only delta:38 passed. Three Chromium scenarios then ran explicitly:two passed on Windows, the remaining Unicode-map scenario passed using the QA Linux runtime. Windows Chrome's Unicode-map extraction assertion remains environment-specific; no PDF renderer code was changed.
- Fixed a billing session race: a pending previous-account request no longer blocks the new account request or applies stale results. Existing account-rotation regression passed.
- Updated stale test fixtures for permission catalog v7, router/cache-header mocks, CRLF source extraction, visible platform pickers and archive confirmation dialog. No signing delivery logic changed.
- SigningSelect now exposes its existing selected/option values as standard button attributes. Existing keyboard, RTL, disabled, portal and callback tests passed. Only its protected release hash is updated.
- No real messages were sent by these tests. Remote renderer verification used only inline synthetic PDF fields, with no application database writes.

Local detailed evidence: outputs/release-manager-home-20261015/{frontend-full,frontend-delta,frontend-delta-final,backend-full,backend-delta,backend-renderer-final,backend-renderer-linux-final}.log.
Tenant merge, migration, artifact and post-deployment results are recorded separately in the release receipt; a build is not evidence of successful deployment.


## Production-specific checks

- Four separate tenant builds passed. Existing reviewed signing baseline retained:103 protected files checked against immutable candidate commits. Main's selector update is documented above; no new signing renderer code was released.
- Four schema-only migration rehearsals passed locally (12 missing ledger entries each). Optional vector-search functionality was excluded from the local runtime and is outside this release's validation scope.
- MelamedLaw merged-settings test:8 passed, including preservation of explicit blank recipients, boolean values, tenant restriction and existing generic settings behavior.
- All four backend deployments retained identical user/case/signing-file counts and platform-settings content at migration time. Private configuration hashes matched; unrelated processes were not restarted.
- All four dashboard data builders passed with read-only database sessions. Public health200; unauthenticated dashboard401; published JS/CSS/logo/manifest match the built artifacts.
- QA UI smoke: calendar first, adviser measurements visible, month selection updated, cases-by-manager and signing sections present. Five-page Hebrew PDF rendered and visually inspected, including RTL and page numbering.
- GitHub emitted six existing dependency alerts (two critical, four high) during pushes. This release did not audit or resolve those alerts; functional validation is not a clean security-audit claim.
- No zero-defect guarantee, full real-customer interactive login test, live WhatsApp sending test or live court integration test is claimed. No real messages were sent by the release tests.
