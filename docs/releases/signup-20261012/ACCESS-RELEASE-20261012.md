# Access and grace release — 12 October 2026

Deployed to the legal clients and LawyerPlatform, MelaMotion and MakeAppointment.

- Three-day grace before subscription access suspension.
- No data deletion in suspension or recovery.
- Verified owners retain billing recovery; customer responses are a neutral temporary-unavailable message without financial metadata.
- New local centered legal notice included in branded builds.

## Evidence

Legal main source b1e9461a, preserved QA merge 043c3436. Live Melamedia QA passed five HTTP groups covering 72 hours, expiry, owner/customer separation, recovery and unchanged user/case/card row counts; temporarily modified QA row restored. 22 affected unit cases passed on QA merge. Four client branch merges 014f4a0c/ca8fcc63/5f263946/df9b54a5 deployed and health 200. Legacy LawyerPlatform c77 runtime preserved and only access backported c6649eb7; 8 identity/privacy checks passed. Normal legacy frontend build passed with existing unrelated ESLint warnings. Compatibility artifact recorded on main cc35e5de.

MelaMotion build eyQ_jK_5rOAR_RuSJspTZ: 32 checks passed on server-private fitbase_access_20261012_qa with mocked provider; five additive migrations rehearsed and applied. Existing production has zero billing-account rows and is unaffected by enforcement until billing is configured.

MakeAppointment build roUZZQMbNxkd1-UrLtgi8: 25 PostgreSQL/HTTP checks passed on server-private barberbooking_access_20261012_qa with mocked provider. Production migration, API compile and web build passed. Existing production businesses with no configured subscription remain accessible.

Public pages load in the integrated browser. A Python default-user-agent HTTP probe received 403 at several public hosts; direct browser checks succeeded. Do not treat that automated probe as availability proof. All six legal backend health endpoints and both monorepo process pairs passed post-activation checks.

No live charge, forced production-customer suspension, real SMS or data deletion was performed. Provider acceptance and native-store behavior retain their separate earlier evidence. This release does not certify unfinished signup activation/renewal scheduling or Central business integration.

Backups: server-private /root/billing-access-backups on both hosts; prior Motion/Barber executable directories in /opt/billing-access-releases. Legal client branding and existing runtime customizations preserved. FTPS used a validated hostname matching the server certificate; no certificate verification was disabled.

Screenshots: legal-customer-unavailable-preview.png shows the local synthetic blocked-customer state; legal-live-qa-calendar.png shows the live QA owner calendar after recovery. Neither screenshot alone proves the server-side enforcement; that evidence is recorded above.
