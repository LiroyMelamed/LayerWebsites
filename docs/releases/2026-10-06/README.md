# Legal platform release — 2026-10-06

Four customer Web/API deployments and contractor-monitor are live and verified. Six signed app binaries were uploaded. Google Play shows the three Android versions under review for full rollout with managed publishing disabled. Apple uploads finished; selecting builds and submitting versions for review still needs the owner's renewed App Store Connect sign-in. Store approval and public availability are not yet claimed.

## Exact provenance

- Shared Web/API: `06b096662c829392cc541926f0a83452633e1adc`.
- MelamedLaw: `9ef26b4884d8eef1d800af8418f6a041af9d92f4`.
- MorLevi: `334a75ecaff8521db4304b21c98907ecca2a1eea`.
- AshrafEssa: `38113d4ddea0a2b7254da84a57d727e50660cef4`.
- Idm: `44dd9741f262e527ba3e00078e5f262ca48a8665`.
- Monitor: `1c33d2e5f2b10c6d80a7440a77ddfa0fb5dc4498`.
- Shared native: `7d3aa6244e4d8e61f4b1ad0d74295d6ecd1bdd3b`.

The JSON records bind each signed store artifact to its exact tenant, source, version/build, EAS build/submission ID and SHA-256. Keep iOS v13 and Android v14; earlier Android candidates are superseded. The production tag identifies the deployed Web/API source. Native store availability remains pending independently.

## Executed regression checks

- Native navigation preserves 12 points/dp above items when chatbot is hidden. Enabling shows the button; remote disable closes an open chat and restores spacing without restarting. Actual iOS QA23 and Android QA14 pass.
- Six-digit automatic OTP, wrong-code recovery, resend/cooldown, changing phone and overlapping-request protection pass. Android14 repeats wrong then correct code in one session; iOS22 covers OTP recovery and iOS23 checks final layout/PDF display.
- A synthetic eight-page PDF was actually signed through Android/iOS in four fields. API, R2, public download, native sharing and evidence ZIP return identical immutable PDF bytes. Original v10 maximum errors at width 800: PDF 0.333334px, iOS 0.580905px, Android 1.390314px. No pixels outside fields changed. These belong to their recorded older binaries.
- Current Android14 rechecks all four signed PDF fields, including 90-degree rotation and a nonzero CropBox, with maximum 1.6 physical-screen-pixel difference. Current iOS23 portrait/rotated preview smoke passes. Both native dashboard ZIPs contain the exact final PDF.
- Chat/calendar settings change actual native UI; disabled chatbot server/direct-page access is enforced. Calendar appointment/hearing reminders appear and navigate to the correct event. Settings consumer mapping is distinguished from behavior verification.
- 133 native tests pass for each customer candidate. Android app release build/lint and final iOS XCTest pass. Monitor has 34 isolated passing tests, preserving existing BCC behavior and generic customer error copy.
- Focused suites: 19 dashboard permission/count/name tests; 22 backend HTTP/dependency checks; 58 live-customization preservation checks including isolated PostgreSQL; 40 frontend checks. Earlier frozen reports contain the broader role/signing/settings/API/browser suites; overlapping runs are not summed.

## Deployment, rollback and cleanup

Each customer received a fresh database/source/environment backup; prior backups passed restore and R2 round-trip verification. Reviewed live customizations were merged first. Four reviewed migrations ran per tenant; Idm additionally needed the missing September tenant prerequisite and 16 reviewed grants. Rehearsal applied the sequence twice with data/privilege checks. All live ledgers now contain 121 entries.

Only target services restarted; customer environment bytes remained unchanged. Assets were published before the index and previous hashed bundles retained. Public health/settings return 200, anonymous signing administration returns 401, and entry bundles match the approved hashes. On three hosts Cloudflare injects a known analytics beacon: only that exact addition is removed before comparing every remaining HTML byte.

Backups: `/root/customer-release-backups/legal-release-20261006-v13/<tenant>` and the monitor's v14 directory, plus recorded frontend v13 backups. Restore actual source/dependencies and restart only the affected service for rollback. Do not overwrite a live database with a backup over later customer writes, run generic migration backfill, delete preserved stashes, or restart all processes.

Monitor now polls each minute while respecting report hour, interval and enablement. Post-deploy readback confirms its actual process cron, unchanged last-run timestamp and no pending delivery. No synthetic report was sent.

Ownership-checked cleanup removed synthetic files 12/11/10, two calendar events, four users, 12 R2 objects and 15 short links. Calendar projections disappeared. QA providers remained noop/jobs disabled; only the earlier separately authorized real SMS was delivered and acknowledged.

## Evidence and retained limits

The accompanying manifest index points to frozen user-facing evidence in `/Users/liroymelamed/Documents/Codex/2026-10-05/new-chat-2/outputs`. Historical reports retain their original dates, builds, failures and pending states. The v14 deployed record supersedes earlier release status. Credentials, OTPs, customer database dumps and private logs are excluded.

Native/frontend build-tool advisories remain, including critical proxy-addr in the frontend development-server tree. The production API version is patched and its runtime audit is clean. Production frontend hosting serves static files; no development server is deployed. This is not a clean overall audit or comprehensive exploitability claim. Third-party react-native-view-shot module lint errors remain; app lint passes. Biometric migration has focused code tests, not a physical-device upgrade proof with an old customer key. Store approval remains external.

The next feature is reusable document templates and bulk signing. Its owner-provided specification is preserved; implementation follows completion of the current release.
