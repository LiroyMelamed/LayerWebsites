# Unified local main and separate legal-client integrations

All five local candidates completed their selected offline backend gates, all
discovered frontend tests, full production compilation and the existing
103-entry signing source guard. The combined main candidate also completed six
actual integrated-browser payment flows with synthetic HTTP/iframe boundaries
and 51 actual PostgreSQL billing cases. This is local source qualification;
no push, deployment, real payment, customer accounting repair or document/email
operation occurred. Missing environment/provider gates below remain open.

## Pinned source and local branches

Fresh GitHub main was `53d177ee`; Melamedia QA had already advanced to
`4a766a35`, including its reviewed measured-PDF-width correction. The other
three client tips were unchanged. These five remote starting pins were rechecked
after the tests and still matched: [read-only recheck](remote-ref-recheck.json).
The original billing branch `codex/card-save-collect-due-20261101` stays at
`1c207a10`; neither it nor any active canonical/client branch was changed.

The shared local branch starts at main and cherry-picks billing implementation
and evidence commits as `10e747c7`, `cf9dbc7d`, `5a88d31f`, `176ff60a`.
Each client branch then has a real two-parent merge of `176ff60a` into its own
client lineage. Later evidence-only commits do not change tested product code.

| Candidate | Local branch | Client/main base | Tested source | All frontend tests | Payment backend | Production compile |
| --- | --- | --- | --- | ---: | --- | --- |
| Shared main | `codex/common-billing-integration-20261101` | `53d177ee` | `176ff60a` | 862/862, 105 suites | 191 pass, 1 skip | PASS |
| AshrafEssa | `codex/ashraf-billing-integration-20261101` | `c469ee2e` | `97b73f91` | 865/865, 106 suites | 191 pass, 1 skip | PASS |
| MelamedLaw | `codex/melamed-billing-integration-20261101` | `0631caf7` | `b54a4b22` | 880/880, 108 suites | 191 pass, 1 skip | PASS |
| MorLevi | `codex/mor-billing-integration-20261101` | `a50afb3f` | `4d41c5c1` | 865/865, 106 suites | 191 pass, 1 skip | PASS |
| Melamedia QA | `codex/qa-billing-integration-20261101` | `4a766a35` | `2d9c7040` | 902/902, 110 suites | 191 pass, 1 skip | PASS |

No final executed gate above has a failure. Counts overlap across candidates,
frontend subgroups and the 51 SQL cases; do not sum them as unique coverage.
All discovered frontend test paths were selected separately for each source.
The billing skip on every candidate is the unavailable full-signup fixture.
Additional common/profile/Word gates and their explicit skips are in each
candidate's report rather than silently counted as full integration acceptance.

- Main: [backend 191/98/51 and source guard](main-backend/README.md),
  [all frontend tests and full compile](main-frontend/README.md),
  [six actual browser flows](browser/README.md).
- [Ashraf source/preservation, 89 common backend tests and full build](AshrafEssa/README.md).
- [Melamed source/preservation, 98 common + 83 portable Word tests and full build](MelamedLaw/README.md).
- [Mor source/preservation, 135 portable common/Word tests and full build](MorLevi/README.md).
- [QA source/preservation, 53 common backend tests and full build](Melamedia/README.md).
- [Independent cross-client source review and exact pins](final-review/README.md).

## Conflict resolution and preservation

Main, Ashraf and QA integrated without conflicts. Melamed's 31 and Mor's 30
conflicted paths were reviewed as actual three-way changes. Protected incoming
Word units and their manifest were already byte-identical to the reviewed
Ashraf release; those exact units were integrated together without regenerating
hashes. Semantic locale merges retained client keys; the shared Word wording
conflicts did not contain client-only changes. Every candidate passes all 103
existing protected-source hashes and preserves the required shipped ancestor.

The independent review confirms the nine billing JavaScript files and three
payment translation keys agree across candidates. Shared profile/filter/mobile
Word changes survived, as did QA's measured-width fix and unique translations.
Melamed's contractor policy/settings/admin enforcement, scoped case/signing
controls and process configuration survived. Client branding, billing defaults,
providers and process identities were preserved; live settings/data were never
used as merge inputs or copied across clients. Stopped court-mail WIP and retired
Idm were excluded. This does not newly verify any customer's live business rows.

One client-only test fixture was repaired in Melamed commit `b54a4b22`: its
unchanged platform settings component needed `MemoryRouter` around the test.
All existing accessibility/save assertions remain, and the runner supplies the
non-secret actual client app name. The complete frontend suite then passed.
Initial missing-dependency, sandbox-listener and resource-timing failures are
retained with the final rerun evidence. No product assertion or timeout was
weakened to obtain a pass.

## Reproducibility and artifact limits

All final candidates used Node 24.14.0, all 520 backend packages and all 1599
frontend packages verified against the current lockfiles, with zero required
package drift. Backend dependencies were installed in a separate temporary tree
with install hooks disabled; frontend reused the matching preserved installation.
Shared dependency trees were not modified. Final frontend gates and compilation
ran with OS network denial and a local resource mutex; backend guards blocked
external requests and application database connections while allowing only
synthetic HTTP fixtures. The real SQL gate permitted only its owned billing
fixture, which was stopped and verified afterward.

Full production compiles used frozen candidate sources, original CRACO/lint
logic, isolated caches, explicit synthetic public API values and preserved
tenant branding. Resource-only cache/minimizer wrappers are recorded. These
artifacts are compile/review outputs, not payloads for deployment with synthetic
API values. Actual customer API/environment/schema activation and live branded
browser acceptance remain separate release work.

Temporary worktrees are under `/tmp/layer-billing-integration-20261101`, owned by
this delegated billing task, to avoid modifying concurrently active canonical
worktrees or creating permanent client copies. Keep them through review and
transfer of the local Git branches/bundle. Do not remove another task's source,
dependencies, ledger, environments or artifacts. The final handoff also supplies
a Git bundle containing the local candidate refs and a focused production diff
against pinned main; no remote publication is implied by local Git preservation.

## Remaining exact environment/provider holds

| Target action | Status/reason |
| --- | --- |
| Complete signup/office-isolation lifecycle on its authorized release fixture | Pending: `SIGNUP_RELEASE_QA_CONFIG` and `legal_signup_release_20261013_qa` on the named local 55440 QA cluster are absent. No DB/access was recreated. |
| Client-profile PostgreSQL migration/RLS fixture | Pending: the owned `CLIENT_PROFILE_TEST_SOCKET` 55487/55488 fixture was not supplied to this task. No other active cluster was borrowed. |
| Actual Word HTTP/SQL and real converter fixtures | Pending: the current worktree's external HTTP fixture is absent and its historical fixture hardcodes an older protected source/owned socket 55491, with destructive synthetic-schema setup. It cannot be reused unchanged to prove this candidate. Real converter/multilingual and Word PostgreSQL gates remain explicitly skipped. No protected environment was altered or new access created. |
| New Takbull sandbox charge/document/email | Not attempted: independent current non-settlement merchant identification remains missing. No real transaction was used as a test. |
| Merchant document type/defaults and actual recipient/delivery | Unverified: the settings GET can initialize data; it was not called under the no-change scope. Verify per-client `BILLING_CUSTOMER_EMAIL` and appropriate name/phone. No document or email was issued. |
| Mor's already-live frontend identity | Pending: existing release-lock file is absent and the public manifest returns 403. Local build qualification does not remove that read-only live-observation hold. |
| Per-client release schema/app-role/live acceptance | Not performed: the broader Melamed/Mor main integration includes Word authoring-render schema/ACL and profile prerequisites. No production migration, grant, restart or deployment ran. |

None of these unexecuted actions has an uncertain payment or production mutation
outcome. All currently authorized local integration work is preserved for
review; customer release authorization and the missing gates are still needed
before publication/deployment or historical billing recovery.
