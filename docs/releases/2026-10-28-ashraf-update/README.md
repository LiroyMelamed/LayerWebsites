# Ashraf update — 28 October 2026

Candidate `87e8eaa58830ee9b42772c1619e01814143dc28e` merges main `4a827586` into the prior Ashraf source `596aa5b7`. The user authorized updating Ashraf only.

## Outcome

Backend deployed and stable; exact 103-file signing release guard passed. Only the existing Ashraf process was restarted. Its environment bytes and every other PM2 process identity/restart count were preserved. One additive Word authoring render migration was applied and recorded; dependencies were unchanged.

Frontend published at 12:12 UTC after the maintenance lock was released. All 116 published static files were hash-verified; incumbent chunks and protected root assets were retained. The original index was changed only by exact entrypoint substitution, with inverse byte-for-byte proof. A fresh authenticated Chrome reload verified `main.e622d4e3.js` and `main.98088501.css`, and loaded signing, reusable templates, Word creation/management and settings without observed console errors. Both hosts were healthy on the subsequent read-only check.

## Qualification

- 808 frontend cases passed across 99 suites.
- 276 backend cases passed, including two local HTTP authentication cases. Four external-PDF cases were skipped.
- Initial missing local dependency-link failures are retained; their failed suites were rerun successfully. No product change was required to resolve them.
- Frozen Ashraf-branded frontend compile passed. Entry points: `main.e622d4e3.js`, `main.98088501.css`.
- Authenticated old-frontend/new-backend smoke loaded clients, signing, templates, calendar and settings. The account has no clients/templates. A load failure during the backend restart resolved with Retry.
- One actual SMS was accepted by the provider and the owner confirmed receipt. Two actual emails were located in the owner’s iCloud INBOX by exact message ID, including a real SIGN_INVITE template with explicit test-only text and no signing package or attachment.
- Visual inspection caught an incorrect LM logo in Ashraf email previews. The firm logo setting was changed through the authenticated settings UI from `/logoLMwhite.png?v=4` to `/tenants/ashrafessa/logos/logoLMwhite.png`. The corrected Ashraf logo was verified visually. The received template had Hebrew RTL styled HTML and no unresolved placeholders.

Earlier actual QA auto-fill acceptance covers names, identifiers, company data, address, selected roles, overrides and missing profiles; it is not represented as a fresh Ashraf client flow. No WhatsApp, native-app, bulk-signing, crash recovery or full-product acceptance is claimed here.

## Recovery and operators

Forward recovery commit `624f95936e03835219db0fabc901c35213970c5d` is verified on remote branch `codex/ashraf-update-rollback-20261028`, with candidate as parent and the exact prior source tree. It was not deployed.

Frontend prior index and manifest are saved on the frontend host under `/var/lib/melamedia-releases/ashraf-update-20261028`. Restore those two files only after a fresh state comparison if recovery is required; old chunks remain available.

The backend checkpoint is private on its host at `/var/lib/melamedia-releases/ashraf-update-20261028`: prior environment, process snapshot and verified local database dump. Do not put private checkpoint contents into Git or automatically restore the database. The additive table can remain if code is rolled back.

Operators are exact one-release tools, not general deployment commands. They reject a changed source/tenant and hold the maintenance and tenant locks. Frontend publication uses the existing reviewed pure index merger, preserves all other HTML bytes/root assets and old chunks, and atomically changes index/manifest after adding validated static files. They record both protected test ledgers. Source, baseline, artifact and environment drift require renewed qualification. Operators have historical local paths and must not be replayed blindly.

Detailed execution receipts, unsuccessful lock attempts and private transport receipts remain in the original task output directory `outputs/ashraf-update-20261028`; recipient details and provider tracking identifiers are intentionally excluded from this portable report.
