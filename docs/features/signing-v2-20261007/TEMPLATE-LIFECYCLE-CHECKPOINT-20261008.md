# Template lifecycle checkpoint — 8 October 2026

Native templates can be archived and explicitly restored. Archiving prevents new sends while preserving private drafts, immutable published versions and existing packages. The library separates active templates from the archive, uses the incumbent segmented control and confirmation popup, and translates the actions in Hebrew, Arabic and English.

The archive confirmation is bound to a separate lifecycle counter. Saving a draft, publishing, archiving or restoring invalidates an older confirmation. Concurrent requests change the head once and append one audit event. Archive requires signing/manage within the current data scope; it does not require upload. Editing and publication retain their existing permission requirements.

Imported legacy revisions remain hidden from new-send choices while the native template is archived. Direct re-import cannot create a duplicate that silently bypasses the archive. An archived legacy source also makes its imported versions unavailable. Restoring the native head cannot restore the legacy source. Creation holds the source availability lock through its existing transaction so an archive cannot race a new send into existence.

Migration: `backend/migrations/2026-10-08_03_signing_template_lifecycle.sql`, additive lifecycle counter. Applied and repeated only in the isolated local database. Rollback of application code does not require dropping this column; preserve templates, versions, packages and events.

Focused verification on the local candidate:

- 22 unique backend scenarios (25 including parents): lifecycle CAS, drafts, source availability, concurrency, scopes, immutable original package records and dependent native authoring/200-person creation. Real local PDFs and fake outbound transports only.
- 27 UI tests: translated archive/restore, cancellation, Escape/focus return, same-tick duplicate guard, stale-confirmation recovery, archived-source restrictions and existing native editor regression. Lint clean; browser harness builds.
- Actual browser renders: Hebrew1280px, Arabic390px and English1280px. Arabic controls are44px with no horizontal overflow; English also has no overflow. Browser-native confirmation stalled the original IAB test tab. Replaced the new native confirmation with the incumbent in-page popup; actual trusted clicks remained ineffective in a recovery tab, so browser archive/restore is **not verified**. Unit tests are not a substitute for that gate.

Evidence and every failed attempt are recorded in the outer workspace's `outputs/signing-implementation-20261007/TEST-LEDGER.md`, prefix `workflow-ux-20261008/template-lifecycle-*`. The before/after browser database snapshot has no archive events and must not be presented as proof of successful browser actions.

This is a local checkpoint, not production approval. Remaining full F1, exact-current QA and representative performance gates are open. No real messages, customer deployments, push or production tag occurred.
