# Production corrections — 9 October 2026

Product `eb94f66e6f1f86e66eeb80112696df7662bcc279`; exact tested QA `6a570cc3fddd349ecdef8352b4a267ca49f09596`. Focused scope approved and deployed under latest direct owner authorization. Historical performance accepted; no new whole-system/provider/performance/native claim.

| Customer | Installed source | Production tag |
|---|---|---|
| melamedlaw | `81f17397bce0c613798b7a848d6916a0e0c3cb4b` | `production-signing-v2-20261009-fixes-melamedlaw` |
| morlevy | `dfcac2b1b22d3bd08857a33e3adb0cd11fd039a3` | `production-signing-v2-20261009-fixes-morlevy` |
| ashrafessa | `0a156bfd590aa0bf0addcdc7fa7a6cb4db84d869` | `production-signing-v2-20261009-fixes-ashrafessa` |
| idm | `3e0ec71e8b6533c2bcbbed3347fac8a65719ccab` | `production-signing-v2-20261009-fixes-idm` |

Documentation/source push `1e47af42bd1a75044f02dc09917d8b54a0b659ea`; all remote heads and annotated tag targets exactly verified. Older production tags preserved.

All environments/branding/dependencies/migrations and concurrent MelamedLaw f722102e were preserved. Full private database/source/env/PM2 backups plus original frontend index/assets remain available. No migration/import ran; release inserted0 rows, and before/after tablecounts are identical for allfour.

Ashraf public health verification had one local DNS timeout. Only that failed request was recovered against the known backend IP with normal TLS hostname verification. Prior completed static assertions were reused; local DNS recovery is not claimed. Failure receipt retained.

Customer announcement is an unsent cumulative draft. Full API-extracted-data Excel and requested admin release email are uncompleted because an authenticated production API session is unavailable. No credentials were minted, data export fabricated, or unrequested customer message sent.

Evidence: production-fixes-20261009/{tenant}/backend-proof.json, front-proof.json, public-proof.json, build-proof01.json, candidate artifacts, git-proof.json; TEST-LEDGER; source/evidence candidate-eb94f66e-source-evidence.json.
