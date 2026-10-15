# MelaMedia website and signup audit — 12 October 2026

## Result

The marketing site is published consistently. Motion and MakeAppointment self-service signup is now configured with the owner-authorized MelaMedia production merchant. Shared LawyerPlatform signup is deliberately unavailable until tenant data isolation is implemented and verified. Existing dedicated legal-client deployments and existing office access were not changed.

## Verified scope

- Public HTTP: all 43 exported index routes returned 200. Local link audit found no broken internal route and no obsolete VAT wording on the six product/pricing pages. Static content validator: 40 public pages / 20 articles; legal catalogue sync passed.
- Marketing calculator: approved final Motion 249/449/699 and appointment 99/199/349. SMS 100/300/500 included, Motion branches/storage bundled, optional services separate. The previous calculator release remains intact.
- Motion and appointment live public catalogues now available. Tampered price and missing billing consent rejected. One synthetic intent per system created a hosted 1 ILS Takbull checkout. Unpaid server synchronization was rejected; zero tenant/billing-account rows provisioned and zero actual payments. Live saved-card production approval was NOT performed. Earlier actual sandbox 1 ILS/token/renewal evidence remains scoped to its QA environment; these are different claims.
- Both schedulers configured: Motion systemd 15-minute timer, authenticated existing cron endpoint; initial run processed 0. Appointment existing 60-second renewal worker enabled. Both products had zero billing-account/subscription rows before activation, so no existing customer contract was enabled or charged. Existing studio public URL preserved for current customer links and QA login compatibility.
- Previous unchanged 72-hour grace, owner/customer privacy, cancellation and retained-data regressions remain applicable to unchanged billing code; they were not rerun on live customers and are not a new end-to-end production charge certification.
- Central: authenticated Motion and appointment subscription feeds connected (1/3 existing business rows), anonymous 401. Corrected appointment billing link to `/admin?tenantSlug=…&view=billing`. Legal feed remains explicitly not_connected. This is subscription visibility, not automatic posting of payment receipts into the manual company ledger or automatic CRM deduplication.

## Legal signup: OPEN release blocker, contained

Live LawyerPlatform backend 82202c18 predates the tested signup/renewal implementation. It lacks consent/quote/renewal-cycle schema and the self-service renewal module. More importantly, signup inserts office owners into platform_admins, while shared customer queries have no office predicate and there are no PostgreSQL RLS policies. Existing law firms running separate databases are a different deployment topology. No customer-data access or cross-office exploit was attempted.

Applied explicit signup availability gate, default closed, at HTTP creation/checkout/completion and service creation/checkout/provisioning boundaries. No payment can be started by the new route while closed; direct public start returns 503 SIGNUP_NOT_AVAILABLE. Public status removes contact details. Separate polling rate budgets restored. New embedded signup shows selected final quote (site/basic/no signing yearly 5,746 ILS with thousands separator), three calendar months and 1 ILS disclosure, plus clear unavailable status and disabled continuation.

Reopening requires a verified tenant architecture (dedicated office instances/databases, or full shared-tenant isolation), tenant-scoped owner permissions, consent/quote schema and deployed verified renewal path. Do not enable SELF_SERVICE_SIGNUP_ENABLED merely because credentials exist. This audit does not certify that blocker resolved.

## New validation and boundaries

- Exact legacy candidate HTTP/service gate: 3 PASS, including direct service bypass denial, no side-effect calls, contact privacy and independent polling limits. A VM harness initially missed `process`; fixed harness and final rerun passed. Evidence legal-gate-tests-r3.log.
- Signup selected-price unit tests 2 PASS. Legacy frontend build passed with pre-existing warnings after installing its exact current calendar lockfile; failed dependency attempts retained. Calendar code was preserved, not replaced from an older branch.
- Marketing Turbopack build hit environment process/port restrictions; existing webpack build path passed, then both content validators passed.
- Appointment API TypeScript build passed. Live business feed access/link checks passed.
- Frontend cached old legal iframe HTML after deployment. Added HTML revalidation in Nginx (preserving CSP) and versioned embed entry; current loaded page shows the revised quote and safety gate.
- Synthetic unpaid Motion audit intent expired without removing provider evidence. Appointment schema correctly prevented expiring an already-created provider order; its single unpaid audit intent is retained, unprovisioned. No customer records deleted.

## Recovery and evidence

Private operator evidence: `/Users/liroymelamed/.codex/melamedia-full-audit-20261012/` (no provider secrets copied into this report).
Front server: `/root/signup-activation-20261012/` contains preactivation DB dumps, previous envs, old lawyer static web and Nginx config. Backend: `/root/billing-access-backups/signup-gate-20261012/` has previous 13 scoped source files and source fingerprints. Central previous config under `/root/billing-access-backups/central-20261012/office-connections-before.env`.
Marketing rollback: `/root/mela-media-static-releases/signup-audit-20261012-r4/previous.tar.gz`. One consistent HTML/RSC build, 44 HTML visible texts unchanged, prior hashed assets retained.

No real card data entered, no customer charged, no SMS/email sent, no existing customer subscription modified, no customer data deleted.

## Release records and final verification

- Marketing deployed source: `cd0c1f3872bad5eea8f77ed288ca1bd8c3bdd8c0` (release R4).
- Exact legal runtime: `f63f8e085cbeb6b3cf93b9f13118b963d03e2ecb`, branch `codex/lawyer-signup-gate-20261012`, pushed tag `PROD_12_10_2026_LIROY_LAWYER_SIGNUP_GATE`. The maintained source branch also contains the availability gate; its newer billing modules were not substituted into the legacy production runtime.
- Maintained legal source gate/HTTP regression: 3 passed, 0 failed (`legal-main-gate-tests.log`); production candidate tests remain separately recorded above.
- Final integrated browser verification of the published marketing iframe: unavailable status visible, continuation disabled, selected annual quote ₪5,746.00, no added VAT. Evidence: `legal-live-final.png`.
