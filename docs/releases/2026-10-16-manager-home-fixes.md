# Manager home corrections — 16 October 2026

This supersedes the calendar and October scoring guidance in the 15 October release.

- The calendar remains the first dashboard section even when today and tomorrow have no events. Its existing empty state and open-calendar button stay visible; module and access permissions still apply.
- Insights describe the measured process directly. The removed Hebrew label is absent from deterministic copy, rejected in generated narrative, and old AI cache entries are invalidated by a new cache version.
- During October 2026 only, scoring combines the durable activity record with identified historical case closures, stage-file uploads, signing-document creation and recorded signing actions. Standalone signing documents qualify too. This is partial history, not proof of complete office activity.
- Repeated actions earn at most one point per employee, case/document, action kind and Israel calendar day. Signing creation and its audit entries share a kind, avoiding duplicate credit. A signing action is not proof of message delivery.
- Mutable historical stage updaters, current case managers, anonymous actions and cross-office actors are not used to invent past authorship.
- At midnight in Israel on 1 November 2026, the historical branch switches off automatically. Only the existing recorded stage-update and closure rules remain; this fallback never recurs in later Octobers.
- This change reads historical rows; it does not backfill or rewrite the database and requires no migration. No real messages are sent by validation.

## Targeted validation

14 scoring scenarios passed, covering the changed query and eight historical-source regressions. Four affected insight scenarios and five new UI regressions passed. Prior unrelated test results are retained; the full suites were not repeated.

Read-only evaluation of the candidate query on all five deployed tenant databases passed. MelamedLaw now produces a monthly ranking from actual historical signing activity, including documents without a case. Results contain only aggregate verification metadata in the local release evidence.

Local evidence: `outputs/home-fix-20261016/`. Rollout receipt is recorded after the QA gate and tenant deployment complete.

## Recovery

Revert the release commit and rebuild each tenant from its own branch, restoring its previous backend revision and backed-up frontend index/assets. No data reversal or SQL rollback is required. Preserve tenant private configuration and restart only that tenant's process.
