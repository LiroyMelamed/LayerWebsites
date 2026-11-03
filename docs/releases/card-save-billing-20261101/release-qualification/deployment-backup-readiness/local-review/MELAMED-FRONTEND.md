# MelamedLaw frontend boundary — HOLD

The legal frontend is the external FTP deployment behind `client.melamedlaw.co.il`, explicitly outside the shared frontend VPS in project instructions. Its physical FTP server and remote root are selected by existing private `MELAMED_LAW_FTP_SERVER` and `MELAMED_LAW_FTP_REMOTE_PATH` variables in `frontend/.env.ftp.local`. No values were opened or inferred here. No FTP, vendor or public API request was made. A listing of `/var/www` or checkpoint roots on the shared frontend VPS cannot certify this separate hosting boundary.

The legacy deploy script preserves only old `main.*.js` and `main.*.css` bundles; these do not constitute full inactive frontend versions. It subsequently builds, uses FTP mirror with deletion, disables certificate verification in its legacy transport and notifies the central deployment service. The script is not a safe read-only inventory command, backup tool or reserve-certification routine. It was not executed. The four files in its tracked `scripts/preserved-bundles` directory are partial public assets, not three complete rollback packages.

A documented publication-receipt review pointed to exactly two full-build archives under the known local cache root. This subtask enumerated that root's MelamedLaw directories, statted and hashed those archives, listed only member headers, and read selected build-receipt source/hash/status fields without environment values. Both recorded archive hashes match their build receipts. No archive member contents were read or extracted.

| Known local artifact | Source receipt | Bytes | Full SHA-256 |
| --- | --- | --- | --- |
| `melamedlaw-common-r5-ready-20261101/full-build.tar.gz` | `5f3a4459256c225be14386178e3cec827e3c79e2` | 12,533,980 | `5db07c3b92d57eec318bf824cb98681f0239a88e32aa9ff53c73bd9096b01cc8` |
| `melamedlaw-sms-number-hidden-20261101/full-build.tar.gz` | `5e2da32b3ebad7b77ace52d50227584a94e1e3ed` | 12,533,586 | `7e4c6435dad3524eac7d5f84d1cd6766197b1f63e99a16090bbea986d68bd70c` |

The common prefix is `/Users/liroymelamed/.cache/melamedia-builds/LayerWebsites/legal-release-20261026/frontend-builds/`. Each archive contains 344 regular-file headers, with index, asset manifest, JS and CSS present and no unsafe/symlink/private-like headers. This is header-level evidence only; it does not certify the full manifest dependency graph, private configuration, current inactivity or a functioning restoration.

The first source is the previously observed public frontend binding. The second is the newer display-change build; its existence is not proof of an older inactive published version. No third documented archive was found at this root. **Three distinct complete inactive frontend rollback versions remain unproven**, as does the FTP destination's current reserve/configuration state. These local artifacts may aid a future bounded review but cannot close the gate by themselves.

Exact paths, archive/receipt hashes and header results: [melamed-frontend-archives.json](melamed-frontend-archives.json). The source pointer was the existing [publication review](/tmp/layer-billing-main-current-20261101/docs/releases/card-save-billing-20261101/rollout-plan/live-baselines/local-health-receipt-review.md). Do not fetch FTP configuration, create/delete archives, publish a new build or restore over this host as a way to complete this read-only review.
