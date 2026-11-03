# QA fixture closure — existing QA only

**The owner cancelled every new Mac PostgreSQL/database/role/extension proposal. Nothing was created or installed. Those actions are not pending approval.** The earlier recipe is retained solely as [cancelled history](historical-local-fixture-proposal.md), with its [cancelled machine plan](plan.json). Do not execute it or its guard as a route around the decision.

The active analysis is [existing-QA eligibility and gate calibration](existing-qa-only-addendum.md), with [machine-readable facts and decisions](existing-qa-assessment.json).

Current existing QA is the `melamedia` database on its existing PostgreSQL16.15 instance, with116 public tables and native vector0.6.0. It is configured as dedicated, with no public RLS/FORCE RLS. The mapped app role is not superuser/BYPASSRLS and owns no public table. The synthetic-only population/owned fixture boundary is not proven. QA Takbull configuration is production; SMS/email/push noop is not a financial-provider gate. Neither skipped test may simply be redirected to this public schema.

- The profile PostgreSQL fixture gap is inherited: profile controller/helper/migration/tests are byte-identical across frozenmain074→billingcandidate6a3. Existing common tests and four-target live catalog evidence remain separate. A scoped release may carry/defer that inherited gap only through an explicit release decision, without marking it PASS.
- The shared signup/office-policy integration gap concerns changed financial/signup paths. The 57-case billing SQL fixture uses minimal synthetic tables and mocked provisioning/tenant-context boundaries, so it does not prove real shared RLS/provisioning. Existing QA has self-service signup disabled; the corresponding setting on the other three clients was not captured. Scope/activation decisions must be explicit.
- A profile controller smoke on only a new owned synthetic record could be considered only after trigger/default/fixture/no-egress safety is proven. It would not be the skipped migration/RLS fixture and is not executed here.

No application, provider, charge, document, mail, schema/role/configuration mutation or test run was performed by this analysis. Only catalog/source/official-documentation reads and these audit documents changed.
