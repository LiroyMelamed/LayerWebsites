# Read-only release readiness — 1 November 2026

**Overall: HOLD.** The required live catalog primitives are present on all four
targets. Existing backup-health reports are fresh and healthy. Full signup and
profile QA fixtures, certified rollback reserves, archive/restore verification,
and financial/provider qualification remain separate gates.

This audit ran at **22:21–22:26 UTC**. It used existing SSH access, existing
shared maintenance and tenant locks, each deployment's existing mapped app
role, `default_transaction_read_only=on`, and explicit `BEGIN ... READ ONLY` /
`ROLLBACK`. It queried catalogs and grants only. No customer or billing row was
queried. No source, live configuration, customer data, gifted period, provider,
document, mail, job, service, permission or infrastructure was changed.

## Live schema metadata

| Target | Catalog checks | Profile column/constraint | Authoring render table | App role |
| --- | --- | --- | --- | --- |
| Melamedia QA | PASS | JSONB, non-null, empty-object default; named bounded-object check | Present, 16 columns; expected constraints, immutable trigger, indexes | SELECT/INSERT; no UPDATE/DELETE; non-superuser, no BYPASSRLS |
| AshrafEssa | PASS | Same metadata and constraint fingerprint | Same metadata and fingerprints | Same authoring privileges |
| MorLevi | PASS | Same metadata and constraint fingerprint | Same metadata and fingerprints | Same authoring privileges |
| MelamedLaw | PASS | Same metadata and constraint fingerprint | Same metadata and fingerprints | Same authoring privileges |

Each target has all 11 selected tables, including the existing signing, billing
and signup tables. The profile constraint is named
`users_client_profile_bounded_object`; its definition includes an object type
check and the 8192-byte bound. All four definition hashes match. The authoring
table has its enabled `signing_word_authoring_renders_immutable` trigger using
`signing_word_record_immutable`; trigger/function hashes match across all four.
Constraint, column, index and grant metadata are retained in the evidence.

This is a catalog check, not a write-based constraint/trigger test or a complete
application startup qualification. All 11 selected public tables report RLS
disabled and no policies. Existing application scoping was not exercised. The
existing `signup_intents` app role grants differ: SELECT/INSERT/UPDATE/DELETE
are available on QA/MelamedLaw and absent on Ashraf/Mor. Nothing was granted or
inferred from that difference; full signup must use the intended existing scope.

Evidence: [remote-readiness.json](remote-readiness.json),
[catalog collector](collect-readiness.py).

## Backups: report age and snapshot age are different

| Host | Existing health report timestamp | Report age at observation | Reported result |
| --- | --- | --- | --- |
| Backend | 22:20:39 UTC | 63 seconds | Healthy, zero failures, 8 checks, every check reports `verified_readback` |
| Frontend | 22:20:37 UTC | 67 seconds | Healthy, zero failures, 7 checks, every check reports `verified_readback` |

Both reports pass the existing two-hour report-freshness check. The backend
report explicitly covers `melamedia-recovery`, `ashrafessa-recovery`,
`morlevi-recovery` and `melamedlaw-recovery`. **Each reports generation age
19.69 hours**, not a one-minute-old database snapshot. Each of those four checks
reports `offsite=verified_readback`.

Verified here: the existing report contents, timestamp, healthy/failure values,
four target coverage claims and readback claims. Not independently verified here:
the actual object's creation time, size, payload/hash, archive listing/integrity,
new offsite readback or restoration. No archive was opened, downloaded or
restored, and no new backup/readback was run. Routine offsite DB recovery does
not establish source/frontend/configuration rollback coverage. A fresh release
preflight must recheck these time-sensitive facts; this record is not a future
release approval.

## Rollback metadata

Existing cleaner status/report files were read; the cleaner itself was not run.
The existing reports do not enumerate a rollback-reserve reason for these four
legal targets. That absence is not evidence that no backups exist. A bounded
metadata-only scan of the two documented checkpoint roots found:

| Target | Backend candidate directories | Frontend candidate directories | Certified complete inactive versions |
| --- | --- | --- | --- |
| Melamedia QA | 0 | 9 | Unknown — HOLD |
| AshrafEssa | 8 | 5 | Unknown — HOLD |
| MorLevi | 2 | 2 | Unknown — HOLD |
| MelamedLaw | 2 | 9 | Unknown — HOLD |

The scan is bounded to 50 newest direct directories per known root, plus direct
tenant children of historical legal-release containers. It records entry/stat
metadata and direct archive-file counts only. Directory counts are not version
counts, completeness/inactivity proofs, archive-integrity checks or exhaustive
server inventory. **At least three complete inactive rollbacks per component
remain unverified.** No reserve, pin or archive was changed.

The separate cleaner's last backend status was `success` (05:36 UTC); frontend
was `deferred` (05:45 UTC), with last run `healthy=false`. This is a cleanup
status, distinct from the healthy backup reports above; no cleanup was invoked
or repaired. Its deferral reason was outside the retained metadata allowlist.

Evidence: [retention-readiness.json](retention-readiness.json),
[metadata collector](collect-retention.py).

## Existing local QA fixtures

At 22:23 UTC, the existing local PostgreSQL listener on 55440 was present.
A catalog-only `pg_database` name query, using existing default access and a
read-only transaction, confirmed that both `legal_signup_release_20261013_qa`
and older `signup_legal_qa` are absent. `SIGNUP_RELEASE_QA_CONFIG` is unset and
the previously named private config file is absent. No environment/config was
created and no alternate credentials were attempted.

`CLIENT_PROFILE_TEST_SOCKET` is unset; fixed owned fixture socket paths and
listeners on 55487/55488 are absent. The full signup and profile integration
gates therefore remain **HOLD**, not PASS or a demonstrated product failure.
No cluster or fixture was created, restored or modified.

The first local socket attempt was sandbox-blocked. The same read-only name
query completed through approved normal escalation with existing access.
No remote audit action was denied, pending, or left with an uncertain outcome.

Evidence: [qa-availability.json](qa-availability.json).

## Remaining release gates

- Use an authorized existing full signup/profile QA source, or explicitly defer
  the affected activation; this audit does not recreate environments or access.
- Certify three complete inactive code/frontend/configuration rollbacks for
  each component, and obtain the required archive/restore evidence through a
  separately authorized process. Metadata counts do not close that gate.
- Complete qualification of the final frozen integration/client commits and
  the all-path financial stop gate. No provider configuration, sandbox identity,
  document type, recipient or delivery setting was queried here.
- No push, deployment, restart or financial activation is authorized by this
  audit. Gifted periods remain untouched, with no recovery or retroactive charge.
