# MelamedLaw loading incident — 18 November 2026

User reported loading screens for office staff on website and mobile app.

## Evidence and correction

Melamed nginx access logs showed repeated hundreds of `/api/Cases/:id/document-requests` reads followed by HTTP 429 for document requests, session-scope and billing-lock reads. `CaseMenuItemOpen` kept every collapsed timeline mounted; each eligible stage fetched the same whole-case resource. A 148-case production list could therefore exceed the 600-user-requests/5-minute limit. Health remained HTTP 200 and a fresh admin dashboard loaded, which did not detect this failure.

Product commit `16be51d3`: mount timelines only for expanded cases/stages; coalesce concurrent whole-case document reads per case and current login token, remove resolved entries, and reject API error envelopes rather than reporting mutations as successful. Limits and authentication protections unchanged. No backend restart, migration, customer mutation, or production messaging was performed.

## Verification

- 23 targeted tests pass, including 240 collapsed cases mounting zero timelines, 30 stages sharing one request, account/case isolation, explicit retry after 429, failed writes, startup token rotation and billing state. Initial failures were a reset Jest mock implementation and an erroneous nonexistent test path; corrected final run passes.
- QA frontend `defe23c4`: 32 collapsed cases, zero timelines; open case 275 mounts one timeline and one HTTP 200 document-requests GET for its two eligible stages. Actual screen checked.
- Melamed frontend `c66b99685f72e7ca4fcfb4c6327985ce4b71e383`: 148 open cases loaded, zero collapsed timelines or loading fallback; opening case 305 shows stages and makes one successful document request. Browser console has no errors. Production reads only.
- Ashraf frontend `c03e245f400578526adfd4bc795cf9967b1f5e90`: authenticated list shows 4 open cases, zero collapsed timelines; case details opened.
- Mor frontend `e1ef20fe536809e98ffda289fc0f532c9f9eddcd`: authenticated list finishes with 0 cases for the verification account, zero loading fallback; this is not an assertion about other accounts' case counts.
- All four sites' public manifests, indexes and entrypoint bytes match the built artifacts. Old immutable chunks and tenant root branding were retained; only frontend assets/entrypoints were published.
- Tag `production-case-loading-hotfix-20261118` pushed on product commit `16be51d3`.

Private evidence: `~/.cache/melamedia-builds/document-workflow-20261117/incident-case-request-final.log`, `incident-production-https.log`, and `case-loading-incident-20261118/{https-proof.json,qa-open-case.png,melamed-open-case.png,melamed-ftps/result.json}`. Pre-publication entrypoints retained under `melamed-ftps/before-*` and frontend VPS `/root/.local/state/melamedia/case-loading-incident-20261118-<tenant>/`.

## Recovery confirmation

An employee was asked to refresh the website and fully reopen the mobile app. The user subsequently confirmed “עובד עכשיו” (“working now”) in response. This closes the reported incident based on user-confirmed recovery; it does not separately certify every office device. Existing tabs can continue running the old bundle until reloaded; previous rate-limit windows last at most five minutes. No independent native-device test was completed in this incident. Browser viewport override attempt remained 1280px; the screenshot was renamed `melamed-list-desktop.png` and is desktop evidence only, not a mobile pass. Backend revisions remain those of the preceding package release; this patch is frontend-only.
