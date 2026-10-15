# Signing incident — 12 October 2026

## What happened

The owner-reported transaction audit identifies **MelamedLaw native build 9**, including the OTP and signature calls. That installation uses runtime **1.0.9**. Its last compatible published update was from July. The recent app release targeted **1.0.11**, so the older installation did not receive the newer signing corrections. Its native signing implementation retained the manual verification control and lacked the later LTR PDF-coordinate correction. A webpage bootstrap also explicitly launched the native scheme for public signing links; that was corrected first.

Actual public signing assets on all five modern sites matched their frozen builds (21 assets each), and active backend signing sources matched Git. This was **not a wholesale rollback of the websites**. Separately, the main Git branch was missing 39 runtime files and diverged on 26 files from the already shipped signing baseline. That release-management gap was repaired by merging the shipped history and adding a 103-file signing release manifest.

## Corrections

- Single-document invitations and resend/copy-link flows now use `/ViewSignedDocument/Link/...` or `/ViewSignedDocument/Signing`. These routes are outside installed-app associations. Existing grants and old routes remain supported; there is no token reset or database migration.
- Batch/package invitations already used the browser-only route family; their authorization and scoped signing manifests remain unchanged.
- Public signing caught by native apps hands off to the current browser flow. Published compatible updates cover MelamedLaw runtimes1.0.9 and1.0.11, MorLevi1.0.5, AshrafEssa1.0.8. No native dependencies, SDKs or runtime identifiers were relabeled.
- The modern incumbent SignatureCanvas blocks submission after a PDF-render failure, including the modal variant. Optional saved-signature library failure no longer reports an already accepted document signature as failed or prevents progress.
- Future standard deployments require reviewed signing ancestry and exact source hashes. Uncommitted backend overlays are retired. Bulk deployment takes a frozen per-tenant candidate plan.

## Verified scope

51 coordinate/real-renderer tests; 35 distinct focused UI scenarios (one failure corrected and only the affected14 rerun); 12 database/real-PDF integration checks including nested scenarios; four release guard tests; four native boundary tests; exact iOS/Android Hermes exports for each published candidate. Existing unchanged evidence was retained.

The owner's already-completed document was viewed read-only through the newly deployed route at390 and1280 CSS pixels. Signature X50.7195/800 and width159.9917 agree with stored X50.7263 and width160; no horizontal overflow and no manual Verify button. The synthetic browser flow separately verified Arabic OTP autoverification, a left signature, recovery after optional signature-library failure without duplicate acceptance, a remaining required field, and a final Finish-only overlay.

No real SMS/email/push tests or customer document signatures were generated. Provider API readback proves OTA publication, not immediate receipt by every installed device. Old installed-app updates apply on the app's normal next-launch update cycle. For a link already captured by an old installation, resend the invitation to obtain the browser-only URL immediately.

## Deployed web/API candidates

| Environment | Exact candidate | API health |
|---|---|---|
| melamedlaw | `f22bc0e1` | 200 |
| morlevy | `308b671e` | 200 |
| ashrafessa | `73db0186` | 200 |
| idm | `ee6f4ae8` | 200 |
| melamedia | `4c0e7b0f` | 200 |
| lawyer | `edcf91d3` | 200 |

All six frontend/API receipts, native groups, versions and evidence hashes are in `release-receipt.json`. QA retained noop delivery and an empty allowlist. Production settings and private configuration were preserved.

The shared LawyerPlatform had concurrent live branding edits. Its first backend preflight stopped on source drift. Our temporary frontend activation was restored by compare-and-swap; ten incumbent tracked/helper files were checkpointed without changing their bytes or restarting, merged locally, rebuilt and then deployed. Existing seed/license files were left untouched. This site's independent signing lineage was not replaced with modern package code.

## Recovery

Private backups are under `~/.codex/private-backups/signing-browser-full03-20261012/` (shared platform final retry:full04), frontend server `/root/signing-browser-full03-backups-20261012/` (shared:full04), and API server `/root/signing-browser-backend03-backups-20261012/` (shared:backend04). Each receipt binds the old HEAD/index, new source and environment checks.

Preserve the new browser route aliases if rolling back: newly issued links depend on them. The earlier URL-only builds under `outputs/signing-link-20261012/builds/` provide a route-compatible frontend fallback; do not blindly restore the pre-alias index. API rollback must retain current environment files, use the recorded prior commit/controller and restart only the named tenant process. The shared-platform prior commit iscf2b5940, which preserves concurrent branding. Native prior groups are documented in the incident/provider evidence; republish only the matching project/runtime, and recognize that the previous native signing UI contained the reported defect. No destructive schema rollback is needed.

All failures and invalidation rules remain in the master signing TEST-LEDGER. Sensitive owner tokens, document contents, contacts and private provider responses are excluded from this release record.
