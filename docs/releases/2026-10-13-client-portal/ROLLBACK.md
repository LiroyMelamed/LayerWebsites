# Rollback record

**Prepared only; no rollback executed by this report.**

Coordinator-owned script: `work/client-portal-release-20261013/ops/unified-documents/rollback.py`.
Script SHA256: `0fc8602ff1746b34fbc433bd10fd4543065a39bb317052e095684f24ee29bf9e`.

Use the exact tenant activation plans and pinned frontend baseline. Default mode is read-only preflight; `--execute` performs an explicitly requested emergency rollback after validating candidate/current-byte compare-and-swap checks. Frontend restores the pinned manifest/index pair; immutable assets stay. Backend restores exact prior runtime detached and preserves environment/dependency/operational flags. A forward fix must reconcile any detached runtime. No forced branch reset or tag rewriting.

| Environment | API private plan | Web private backup |
| --- | --- | --- |
| Melamedia | `/root/client-portal-backups-20261013-unified-documents/melamedia/rollback-plan.json` | `/root/client-portal-web-backups-20261013-unified-documents/melamedia` |
| MelamedLaw | `/root/client-portal-backups-20261013-unified-documents/melamedlaw/rollback-plan.json` | `~/.codex/private-backups/client-portal-web-20261013-unified-documents/melamedlaw/files` |
| MorLevi | `/root/client-portal-backups-20261013-unified-documents/morlevy/rollback-plan.json` | `/root/client-portal-web-backups-20261013-unified-documents/morlevy` |
| AshrafEssa | `/root/client-portal-backups-20261013-unified-documents/ashrafessa/rollback-plan.json` | `/root/client-portal-web-backups-20261013-unified-documents/ashrafessa` |
| Idm | `/root/client-portal-backups-20261013-unified-documents/idm/rollback-plan.json` | `/root/client-portal-web-backups-20261013-unified-documents/idm` |
| LawyerPlatform | `/root/client-portal-backups-20261013-unified-documents/lawyer/rollback-plan.json` | `/root/client-portal-web-backups-20261013-unified-documents/lawyer` |

Backup paths are planned until the corresponding receipt exists. Detailed journals retain partial-publication recovery. Source, environment, prior baseline or backup drift must block recovery rather than be overridden. Actual remote rollback is not a tested claim.
