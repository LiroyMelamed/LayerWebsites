# Public signing links: browser fallback

On 12 October 2026, an office reported that a recipient opening an SMS signing link was asked for a suitable app. The original recipient URL/device is unavailable, so the exact customer interaction is not verified.

The deployed MelamedLaw HTML reproduces a related defect: opening `/s/<slug>` or `/PublicSignScreen` with an Android/iPhone user agent injects hidden `melamedlaw://` and `melamedia://` frames. Those automatic attempts can interrupt users without an installed handler even though the SMS contains HTTPS. The patch lets these public routes remain in the browser. Existing verified OS app links, token/query handling, and unrelated home-page behavior remain unchanged.

Separately, the effective Melamedia QA process uses `QA_OUTBOUND_MODE=noop` with an empty allowlist. Its latest SMS attempt was logged as suppressed. This explains the owner's missing QA message; it does not establish a production SMS delivery failure. Production MelamedLaw has no QA suppression enabled. No provider calls or configuration changes were made.

## Focused evidence

- Deployed HTML reproduction: 2 failures (MelamedLaw Android/iPhone), 4 controls passed. Actual minified HTML was executed, using synthetic URLs without accessing client documents.
- Source templates: 21 focused cases passed across the default page and six tenants.
- Five changed templates through the incumbent HTML/JavaScript minifier: 15 dependent cases passed. These repeat the affected contract after minification, not 15 additional unique business scenarios.
- Existing QA/lawyer templates already contain no forced app opening. No QA deployment is needed for an unchanged template.
- This is a bootstrap execution check, not a physical-device dialog test, full signing-flow test, or full React build.

Evidence is preserved outside Git in `outputs/signing-link-20261012/`, with hashes, before/after HTML and logs. Every run is appended to the shared signing test ledger. Changing an affected HTML bootstrap or its emitted artifact invalidates the corresponding evidence.

## Release boundary

Local fix only. The latest owner-supplied AGENTS instructions prohibit deployments to MelamedLaw, MorLevi, AshrafEssa and Idm. No customer deployment, main push, production tag, database change, message resend or automatic QA outbound enablement was performed.

When deployment is authorized, apply this narrow source patch to the current tenant heads, retain each tenant's unrelated bootstrap/retry logic, compile its HTML, back up the current deployed entrypoint and verify exact public bytes after publication. Rollback restores the backed-up entrypoint. Do not replace current JavaScript bundles or change messaging configuration for this HTML-only correction.
