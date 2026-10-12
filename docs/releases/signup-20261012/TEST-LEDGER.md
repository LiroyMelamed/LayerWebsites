# Signup and renewal evidence — 2026-10-12

Scope: LawyerPlatform public signup; no client deployment and no signing QA. Branch Melamedia with uncommitted signup/billing changes.

- PASS real Takbull TEST hosted1ILS native signup, encrypted token and one synthetic tenant in owned local signup_legal_qa on55440. Private legal-sandbox-result.json. This original provision exposed UTC/DST trial-date drift; it is NOT evidence of the subsequent corrected Israel-calendar implementation.
- PASS corrected calendar plus strict order/card-transaction identity tests and affected package billing regressions:20/20; private legal-billing-tests-20261012.log. Source signupPaymentVerification.test.js, calendarMonths.js, firmBillingService.js current worktree.
- PASS real saved-test-token renewal: early charge skipped;3 concurrent native renewals yield1 verified1ILS provider payment; cancellation blocks renewal. Dedicated synthetic clone0e233d8e-a16b-4593-8ee4-00e8a022e4b5; original signup380ILS/month preserved. Private legal-sandbox-renewal-20261012.log. Provider verification and dispatch/cancellation row lock included.
- Migration2026-10-12_signup_renewal_cycle.sql applied only localQA; no production migration/deployment. Production UI, scheduled dispatch and Central still pending.

- 2026-10-12 new VAT quote checks: FAIL; commit aa064fea10ec7880ec9ee475f870a7c52548ecab + uncommitted patch. Evidence: /Users/liroymelamed/.codex/signup-implementation-20261011/legal-signup-quote-tests-20261012.log. Unit quotation only; no new provider charge or production deployment.
  - backend/lib/billing/signupQuote.js SHA256 12ae1c27044386908e654684dcca94c8e4f79529f43db485ff0dfb9457c43b89
  - backend/lib/billing/selfServiceRenewal.js SHA256 5fcdd8209d378971cfc896e238305ce8deab89c382d9e76263cb72a784af0797
  - backend/lib/tenant/signupService.js SHA256 a8402a3b08270aa733bab406f9d6ad6dcd54411f3d02db882f2bb5fcbb5abe33

- 2026-10-12 quote/verification rerun PASS 7/7 (120 catalogue combinations); corrected test float-to-cents comparison (647.82×100 is not an exact JS float). Same product files as preceding fingerprint, commit aa064fea10ec7880ec9ee475f870a7c52548ecab. Evidence /Users/liroymelamed/.codex/signup-implementation-20261011/legal-signup-quote-tests-20261012-r2.log. No provider request.

- 2026-10-12 native local DB quote PASS. Monthly448.40 / yearly4842.72 gross; parallel retries one intent; net-only amount rejected; no provider request. Own unpaid synthetic intents removed. Migration2026-10-12_signup_recurring_quote.sql applied only signup_legal_qa:55440. Evidence /Users/liroymelamed/.codex/signup-implementation-20261011/legal-quote-db-20261012.log

- 2026-10-12 targeted unit suite PASS 16/16, aa064fea + working patch. Quote, provider verification, billing defaults/lock tests. Evidence private legal-final-targeted-20261012.log. This does not establish HTTP rate-limit behavior.
- 2026-10-12 frontend CI build FAIL, aa064fea + working patch: completion useEffect omitted its check callback dependency. Evidence private legal-frontend-build-20261012.log. Corrected with a memoized callback; pending rebuild. No production mutation.

- 2026-10-12 frontend CI rebuild PASS exit0, aa064fea + memoized completion callback. Evidence private legal-frontend-build-20261012-r2.log. Built against owned LOCAL API3116; no production deployment. Owner price/VAT clarification now blocks activating the new quote.

- 2026-10-12 OWNER CORRECTION: legal prices are final/no VAT added; website or app is mandatory. Historical quotes/tests448.40/4842.72 and120 new-signup combinations no longer establish the desired behavior. New public quote, website and consent corrected; historical contracts retain agreed values. Pending targeted90-combination and schema-backed tests.

- 2026-10-12 first corrected unit run FAIL: test fixture typo5320 instead of532.00;90 quote combinations passed. Evidence private legal-owner-pricing-tests-20261012.log. Corrected test literal and added explicit later-plan-change coverage; pending rerun.
- 2026-10-12 corrected native DB quote PASS, aa064fea+working patch.532/month or5746/year final, VAT0, system-only selection rejected,18% inflated client price rejected, parallel starts one intent. Own unpaid fixtures removed, provider requests0. Evidence private legal-owner-pricing-db-20261012.log.

- 2026-10-12 final owner-price tests PASS17/17 (all90 allowed combinations, mandatory portal, no extra VAT, final-price display/renewal, legacy agreements, accepted later plan change); private legal-owner-pricing-tests-20261012-r2.log. HTTP guard tests PASS2/2 (poll budget separation, creation limit, no free completion, exemption boundaries), private legal-signup-http-20261012.log. Frontend selection tests PASS2/2 (ignore system-only/price injection,532 monthly/5746 annual), private legal-signup-frontend-tests-20261012.log. Source aa064fea+patch. Provider calls0, local-only.
- 2026-10-12 owner-price frontend CI build PASS, private legal-owner-pricing-build-20261012.log; subsequent thousands-separator formatting in PricingCalculatorCard requires new build. No deployment.

- 2026-10-12 isolated main candidate: base1d031ccf + scoped patch,19 backend tests PASS (legal-main-candidate-tests-20261012.log). CI frontend build FAIL on a pre-existing unused setClosed binding in main's PublicSigningScreen; removed only the unused binding, preserving the existing state and behavior. This is not signing behavior validation. Evidence legal-main-candidate-build-20261012.log. Rebuild pending.


2026-10-12 LOCAL grace/privacy current verification:30/30 focused HTTP/auth/permissions/privacy/defaults tests PASS (`legal-access-current-tests.log`);6 schema-backed renewal/grace scenarios PASS (`legal-grace-db.log`), actual owned PostgreSQL17.11 at127.0.0.1:55440/signup_legal_qa, mocked provider only. Decline starts72hours, retries preserve deadline and cycle, exact expiry locks without deleting fixtures, missing-card and uncertain outcome get grace, independently verified mocked success clears failure and restores access. Headerless authenticated customers use the DB identity tenant for billing; owner recovery endpoints stay reachable. Backend/frontend hashes in private `legal-grace-source-sha256.json`. No production write/real payment.

Initial schema restoration FAILED because pgvector is absent on this local PostgreSQL. Billing-only restoration then passed with the unrelated knowledge_chunks embedding column represented as text and vector index omitted. All billing/identity constraints are unchanged. This is not RAG/schema parity proof. Current frontend build PASS (`legal-access-build.log`); runtime browser check/deployment still pending. Later dependent code, schema, settings or provider changes invalidate these results.


2026-10-12 final grace continuation: main candidate1d031ccf + scoped patch.55/55 backend tests PASS (`legal-access-current-tests-r3.log`),7 schema-backed mocked renewal/access tests PASS (`legal-grace-db-r2.log`),3/3 React lock-provider tests PASS (`legal-access-ui-tests.log`), current frontend build PASS (`legal-access-build-r3.log`). New additive firm_auto_renew migration separates cancelled renewal from free access; no historical disabled-row backfill. Verified exact expiry and preserved tenant/signup/card rows. Local integrated-browser native compiled frontend shows only temporary-unavailable text to User even with stale local owner flag, and Admin can render the actual PlanUsage recovery controls. Browser uses clearly synthetic loopback-only API fixture, not real provider/production integration. Capture paths: screenshots/client-temporary-unavailable.png and owner-billing-recovery.png. Initial UI fixture erroneously double-wrapped success JSON and failed; corrected fixture to actual API shape before captures. Found and fixed refresh recursion/dedup and owner recovery-role flashing. Those are covered by current React tests. Screenshot is behavior proof for the supplied synthetic responses only.


2026-10-12 centering refinement:87ef76ee + scoped CSS/button-class patch. Frontend production-mode CI build PASS (`legal-centered-unavailable-build.log`). Integrated browser checked compiled client unavailable screen with synthetic loopback API at desktop1280x720 and mobile390x844: title/body/retry button centered; no billing disclosure. Evidence screenshots/client-temporary-unavailable-centered.png and client-temporary-unavailable-centered-mobile.png. No backend changes/provider calls/production deployment. Previous backend verification remains applicable.
