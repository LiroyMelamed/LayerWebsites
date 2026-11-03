# Read-only deployment and existing-QA preflight

Frozen product: `6a3bd299` / upstream cutoff `074df752`. Captured 2026-11-01T23:33:51.679255+00:00. **HOLD: current configuration is not a proven paused boot, and native paid/signup/profile tests are not safe to run on the existing QA as-is.**

All observations used existing maintenance and tenant locks, mapped existing application roles, and catalog-only `BEGIN ... READ ONLY` / `ROLLBACK`. No customer/billing/application records, provider requests, app imports/boot, services, source, configuration, grants, roles or databases were changed. Idm was excluded.

| Target | Source HEAD | PM2 PID / Node | Mode | Production dependencies | Protected source |
| --- | --- | --- | --- | --- | --- |
| MelamedLaw | `d6ef0c9a` | 2729613 / 22.23.2 | dedicated | 507 matched; missing 0, drift 0 | 103 matched |
| MorLevi | `586f93e5` | 2728989 / 22.23.2 | dedicated | 507 matched; missing 0, drift 0 | 103 matched |
| AshrafEssa | `3359e65c` | 2728497 / 22.23.2 | dedicated | 507 matched; missing 0, drift 0 | 103 matched |
| Melamedia | `545779e4` | 2729957 / 22.23.2 | dedicated | 507 matched; missing 0, drift 0 | 103 matched |

Every tracked checkout was clean and stable during capture. All four source locks match the frozen candidate lock. The seven backend paths changed since the retained 22:05 baseline are the already-qualified QA outbound/notification/transport recovery changes; each matches the frozen candidate. No new refs were fetched or merged. The remaining candidate difference is 14 financial runtime files and 11 tests: this preflight does not claim the billing fix/pause gate is deployed.

## Startup/catalog result

- All four effective candidate projections are **dedicated mode**, with distinct existing databases/app roles. Literal `ensureOfficeIsolation` therefore skips RLS enforcement. RLS=false is not a failure in this mode and does not justify a mode change or broad migration.
- Existing mapped roles are non-superuser/non-BYPASSRLS, public schema usage succeeds, profile JSONB and signing fieldtype/fieldvalue columns are present. The signing schema warning does not apply. Catalog success does not execute or validate application rows.
- The recognized client branch/firm-name guard requires `platform_settings` records; those were not read. No actual branch/firm-value match is claimed. Protected source hashes and PM2 online status do not cryptographically bind already-loaded code to a commit.
- Installed package versions match, but native imports/ABI and application startup were not executed. Observed Node is22.23.2; local backend qualification used24.14.0.

## Existing QA eligibility

**Native financial/signup/profile flows remain blocked.** QA is the existing dedicated `melamedia` database / `melamedia_app` role:116 public tables, noRLS, and no verified exclusive synthetic fixture or data population. The two named signup fixture databases and QA/test namespaces were absent from the queried catalogs. The role lacksCREATEDB/CREATEROLE; its schemaCREATE/DML privileges do not authorize using them.

QA explicitly selects **Takbull production mode**. The financial pause flag is unset, which enables the candidate gate by default. Its valid outboundnoop configuration has zero recipient exceptions and covers SMS/email/push, **not Takbull**. SMTP is a non-loopback hostname; no provider credentials were inspected or exported and no provider endpoint was called. Nonsettling merchant identity, credential absence and provider egress fences were not proven.

Do not retarget the old hardcoded signup/profile tests to QA public tables: they require shared-isolation semantics and/or destructiveDDL/global role setup. The owner denied new Mac PostgreSQL; no Mac database action or replacement environment was attempted.

## Remaining release holds

Existing flags do not implement the explicit pausedboot contract: financial pause is absent, signing-worker flags remain enabled, and QA also enables independent demo/court workers. No flags were changed. Source also makes an unconditional ipify request after the isolation check. Safe drain, issued hosted pages, unknown payments, callback retry/retention and already-accepted upstream work remain separate holds, as do backups/restore and real document delivery.

[Redacted summary](preflight-summary.json) · [Detailed source/process/catalog metadata](remote-preflight.json) · [QA classification](qa-eligibility.json) · [Exact startup mapping](startup-map.json) · [Catalog-only SQL](catalog-queries.sql)

All untouched private values remained out of evidence. `/proc` exposes initial environment; current env-file fallback is a candidate boot projection, not proof of arbitrary in-process environment changes. Read-only catalog compatibility is not deployment approval or a zero-side-effect appboot proof.
