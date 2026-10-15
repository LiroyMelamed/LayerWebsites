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
