# Final bounded discovery of an existing restore target

**HOLD: authenticated restore cannot be certified from the documented existing resources.** This is a bounded finding, not a global assertion that no other environment exists.

One SSH metadata call per known host completed at **2026-11-02 00:02:27 UTC**, under the existing shared maintenance and four tenant locks. No restore/helper/pg_ctl script, DB connection, decryption, start, install, environment creation or live write occurred.

| Documented metadata | Backend | Frontend |
| --- | --- | --- |
| Existing melabackupcheck non-login account | Present, UID999 | Present, UID997 |
| Direct /var/lib/melamedia-isolated-restore-* entries | 0 | 0 |
| TCP55489 and Unix .s.PGSQL.55489 listeners | 0 / 0 | 0 / 0 |
| Processes owned by the verifier identity | 0 | 0 |
| Matching dedicated restore service names | 0 | 0 |
| Documented helper files and PG16 binaries | Present | Present |
| Documented recovery-check receiver root | Present, empty | Present, empty |

Checked roots were limited to `/var/lib` direct entries with the documented restore prefix, `/root/audit-remediation-20261008/backup-coverage` and its known helper/receiver names, matching direct service names under `/etc/systemd/system`, and the documented PG16 tool paths. No wide search was performed.

The historical helper source uses a random per-run cluster root, creates a missing verifier account, runs initdb/pg_ctl on a private Unix socket at55489, and finally stops PostgreSQL and deletes its temporary root. It does not define a persistent approved QA quarantine. Invoking that helper would create a new environment even though its OS account already exists, so it is not an allowed workaround.

**Owner instruction: no new environment anywhere, not just on the Mac.** All new fixture/cluster/database/environment plans are cancelled, not pending. Existing QA may be used only after isolation, synthetic-only records and inability to charge are proven. This discovery neither starts a target nor authorizes data restoration into QA. The 12 existing CMS size/hash/envelope checks remain valid and remain different from authentication/decryption/restore verification.

[Structured evidence and exact checked scope](existing-restore-targets.json) · [current owner constraint](OWNER-QA-ONLY.md) · [backup evidence](evidence.json) · [action state](pending-actions.json)
