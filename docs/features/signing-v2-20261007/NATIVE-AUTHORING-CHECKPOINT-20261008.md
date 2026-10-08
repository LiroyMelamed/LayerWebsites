# Native template authoring checkpoint — 8 October 2026

Local implementation only. Not production-ready, not deployed, no production tag.

The incumbent template builder and PDF editor now edit native versioned templates. Staff can define typed document information, place data overlays, assign signer roles to parallel stage groups, save a private draft and explicitly publish a reviewed immutable version. Source registration validates actual PDF bytes and ownership, retains the original geometry, and verifies content hashes. Publication rejects stale concurrent editors. Source PDF reads and authoring use the existing office permissions and deployment context. Published templates and private work remain separately recoverable; the matching imported legacy entry is not duplicated.

The UI preserves existing policy, authority, conditional and role-slot metadata; it does not yet provide all controls to author those advanced attributes. It uses existing language preference, he/ar/en, RTL/LTR and the incumbent PDF/signing components. No signing/consent protocol or PDF-coordinate transform was changed. Editor-only data labels distinguish filled information from a signer. Inputs freeze while saving, and mobile stage/audience selectors retain usable width.

## Focused evidence

Authoritative append-only ledger in the owning workspace:
`outputs/signing-implementation-20261007/TEST-LEDGER.md`.
Evidence prefix: `outputs/signing-implementation-20261007/workflow-ux-20261008/`.

- `native-authoring-backend-06.log`:18 passes (16 distinct child scenarios,2 parent tests). Private drafts, CAS/repeated creation, immutable versions, stale-base publication, actual PDF hash, source/office/role/deployment restrictions and prior authoring regression. Migration applied/repeated only on isolated local55442.
- `native-authoring-ui-06.log`:46 passing tests in four suites; workspace suite failed before running due to test-mock transformation. Fixed workspace suite `native-authoring-workspace-07.log`:13 passes. Combined current coverage59 tests. `native-authoring-lint-03.log`:clean.
- Actual browser: Hebrew1280px author/save/reopen; Arabic390px PDF/review/publish/create; corrected mobile role controls321×44px with no horizontal overflow; English1280px. All new labels translated and no console errors/warnings. Source titles/names stay unchanged.
- `native-authoring-browser-db.json`:browser-created immutable version2, original version1 and signature spots unchanged, exact000012345 identifier in snapshot,2 ready stage0 tasks and1 blocked stage1 task. Real prepared2-page PDF downloaded through protected office API and SHA256 matched the stored artifact. Only fake provider transport.

Earlier failures and screenshots are intentionally retained. Backend04 once returned404 instead of expected403 for a denied client request; no access was granted. Isolated05 and paired06 pass with additional route diagnostics; the earlier denial-status difference remains unexplained and is not declared fixed.

Changes to authoring/templates/routes/source registration/migration invalidate the respective backend results. Changes to adapters/builder/roles/data controls/workspace/locales invalidate related UI/browser evidence. Shared SignatureSpot changes in this checkpoint are presentation-only; any future coordinate/signing changes require renewed geometry/signing tests. These passes do not approve untested advanced authoring, real transport, current liveQA or representative performance.

## Remaining before release

Multiple people/capacity/authority controls, advanced template defaults/conditions, native archive lifecycle, client-card entry, decline/clarification/completed-copy and frozen bulk actions remain incomplete. Review native imported-template catalog behavior when its legacy source is archived before enabling release. Existing historical remote PDF readiness still fails30/60s goals; newest candidate has no representative performance or liveQA approval. Customer deployments remain forbidden by the latest supplied AGENTS.md. Preserve source/migration backups and all immutable evidence; do not tag this as production.
