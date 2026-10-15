# Verified production corrections — 9 October 2026

Product eb94f66e, exact QA6a570cc3, and four actual customer source/static/API receipts are pinned here. New changes cover startup session recovery, all nine incumbent fields, office/client/manual recipients, independent personal stamp consent and configured one-page PDF upload, explicit final-only automatic office mark, and localized permission labels. Existing signature/OTP/stage/geometry/privacy proofs are reused only while unchanged. No broad QA/performance/native/store or real test sends were repeated.

All existing customer branding, environment, locks and migrations are preserved. Cursor f722102e remains an ancestor on MelamedLaw. Each customer has private source/environment/full database backups; old frontend assets and original index are retained. No migrations or data import ran, and deployment inserted zero rows. Existing production tags remain immutable. The exact runtime customer tag and final documentation commit are separately verified after push.

The cumulative customer update remains an unsent draft. Full production API-data Excel and the previously requested administrator email remain uncompleted: there is no active authenticated production API session, and no authentication bypass or misleading SQL-as-API export is permitted.
