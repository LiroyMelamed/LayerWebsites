# Office connections: Net HaMishpat demo and official WhatsApp

Implemented on `codex/office-integrations`, based on `main`. No real court case, WhatsApp account, message delivery, or deployment was used in local validation.

## User flow

- Platform settings → **חיבורים למשרד**. Platform admins select the office. An office owner also has a direct navigation entry and can connect or disconnect only their own office.
- Court: enable and save the demo connection, create two demonstration cases, and sync three synthetic updates. Two match automatically; one waits for a mapping. Repeated syncs do not duplicate events. Only `integration_demo=true` cases can be mapped. The case view shows imported demo updates to authorized staff.
- WhatsApp: the owner opens the official Meta Embedded Signup window, chooses the business and number, and grants access. The server exchanges the one-use code, validates app permissions and asset ownership, registers the number if necessary, subscribes to the WABA, and encrypts the grant per office. No customer copy/paste of access tokens is needed.
- The platform administrator saves the default invitee numbers, optionally checks **הזמן אוטומטית גם את מנהל התיק**, and enables/disables automatic groups. The manager is resolved from `cases.casemanagerid` and their own office's `users.phonenumber` when the case is created. Numbers are normalized and deduplicated. With the manager enabled, up to six fixed invitees can be saved; otherwise up to seven. Manager-only invitations are supported.
- New cases enqueue one group request transactionally. A worker creates the group; the signed Meta creation webhook attaches its invitation link to the exact case. Each recipient receives the configured group invitation template. The person chooses whether to join; adding people without their acceptance is unsupported.
- In demo mode there are no external calls and no invented WhatsApp links. Court demonstration cases use a synthetic manager number when the checkbox is selected. Demonstration cases are never dispatched in live mode.
- Disabling cancels pending invitations permanently, including when a creation webhook arrives later. Existing external groups remain. Changing defaults or the assigned manager does not change an already queued invitation snapshot.
- A missing/invalid manager phone leaves an explicit `needs_attention` record without preventing case creation. This version does not automatically resubmit that case after a profile correction. An operator must review it; manual database retries must never be used for uncertain remote outcomes.

## Official Meta prerequisites

Checked against Meta documentation on 2026-10-14:

- [Groups API](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups): requires an Official Business Account (OBA), with a maximum of eight participants. Not available for WhatsApp Business app/coexistence numbers or Multi-solution Conversations. Ordinary business verification does not itself grant OBA status.
- [Embedded Signup implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation): configure the current v4 flow, a Tech Provider/Tech Partner or Solution Partner setup, approved app permissions, HTTPS allowed domains and valid OAuth redirect URLs. This implementation follows the Tech Provider flow, not a Solution Partner credit-line integration.
- [Tech Provider onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider): customers must also add a payment method in WhatsApp Manager.
- [Group setup and invitations](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/get-started): add a Group invite link template from Meta's template library to each WABA and wait for approval. In platform settings save its name, language, and any extra text parameters while disabled; check readiness, then enable. Readiness checks approval, language, and name; the operator must select a group-invitation-compatible template.

The code handles the default Cloud API `FINISH` event. Configure this signup flow, not coexistence or numberless signup. The popup is preloaded and launched directly from a click. Code and asset messages can arrive in either order. Expired/cancelled signup must be restarted. Disconnect invalidates pending completions and clears local credentials; it does not delete the external business account or its groups.

## Deployment preparation

Platform admins open integrations inside Platform Settings; the old standalone URL redirects to its integrations tab. Office owners retain their scoped standalone page. New cases start at stage 1. Both create and edit accept optional `CourtCaseNumber`; the normal case reads/search return it. Omission preserves the current reference for older clients, while an explicit empty string clears it. A duplicate within the office returns 409 and rolls back the case transaction. References can be saved while the court connection is disabled. Synthetic updates attach only to demo cases or the dedicated QA environment.

Apply `2026-10-15_00_case_court_reference.sql` after the initial integration migration and before this case-form update. It selects a stable primary reference for each existing case, preserves additional aliases, and enforces one primary reference per case.

1. Follow the repository rollout: main → Melamedia QA → client tenants. The integration demo is deployed on Melamedia QA only; client rollout requires separate authorization.
2. Apply `backend/migrations/2026-10-14_00_office_integrations.sql` before loading the backend code. Requires PostgreSQL 15+ and the pre-existing tenant/case schema. The new-case transaction uses the new outbox table. Use the schema maintenance role, never the restricted application role.
3. Shared databases: the migration installs FORCE RLS and reference/owner guards when the isolation functions exist; the normal isolation installer also classifies the five new tables. Grant the existing non-owner runtime role SELECT/INSERT/UPDATE/DELETE on these five tables. Verify isolation startup checks pass. Do not run migration/installer against unreviewed real data to test this feature.
4. Add the variables from `backend/config/officeIntegrations.env.example` to the backend's secret environment. Generate a random 32-byte encryption key as 64 hex characters. Back it up securely; no plaintext token or PIN is exposed by the API.
5. Configure Meta's app webhook callback as `https://<api-host>/api/webhooks/whatsapp`, with the configured verification token. Subscribe the app to `group_lifecycle_update`, `group_participants_update`, `group_settings_update`, `group_status_update` (and `messages` if required by the app setup). WABA subscription is completed during onboarding. This version processes creation lifecycle events only; it does not ingest group conversations or participant status.
6. Allow the Meta JS SDK, login popup and Meta origins in any frontend CSP/COOP rules; configure the actual frontend HTTPS domains in Facebook Login for Business. Keep app secrets server-side. Each dedicated deployment needs its own correctly routed webhook or an explicitly designed shared router; do not point several separate databases at one callback by accident.
7. Keep `WHATSAPP_LIVE_ENABLED=false` and `WHATSAPP_WORKER_ENABLED=false` for local/demo testing. The demo test button works without a worker. Only after a real authorized QA onboarding and template check should both flags become true, with `BACKGROUND_JOBS_ENABLED` enabled. No credentials are included in this branch.

For unattended QA of normal case creation, set both `WHATSAPP_DEMO_ONLY=true` and `WHATSAPP_DEMO_WORKER_ENABLED=true`. This runs only the simulation worker even when `BACKGROUND_JOBS_ENABLED=false`; all Meta requests and live activation are blocked. On Melamedia, retain `QA_OUTBOUND_MODE=noop` with an empty `QA_OUTBOUND_ALLOW` to suppress existing SMS, email and push transports too. Do not enable the other delivery schedulers for this test.

## Reliability and limits

- Office filters are explicit in service queries and reinforced by database RLS in shared mode. Webhooks route using both the signed WABA ID and phone ID; the job's immutable phone/WABA, unique subject and request ID are checked again.
- Group jobs and case creation commit together. Claiming is persisted before an external mutation. API timeouts and stale creation claims become `uncertain`; there is no blind retry that could create duplicate groups or invitations. Stale claimed invitations likewise become uncertain.
- Template values and recipients are captured for the case. An existing manually linked group is preserved. Court imports do not create calendar events or contact clients. No live Net HaMishpat connector or saved smart-card/session credentials are implemented.
- “Invitations sent” means Meta accepted the send request, not delivered/read/joined. Delivery/participant tracking, retry/reconciliation UI and sending case updates into groups are outside this change.
- The worker handles one group and one invitation per office per tick (15 seconds). Production performance, actual Meta availability, billing setup, account eligibility, template compatibility, and the deployed database schema still require authorized QA with real integration credentials.

## Local verification

Backend: `node --test tests/officeIntegrations.test.js tests/officeIntegrations.http.test.js` (15 tests, disposable PGlite PostgreSQL, no external database). Covers office boundaries including actual RLS, foreign references, encrypted grants, nonce replay/revocation, webhook signatures, transactional outbox, no duplicate delivery, disabling during creation, manager resolution/deduplication, and official request contracts with a fake Meta provider.

Frontend: `npm test -- --watch=false --runInBand --runTestsByPath src/services/whatsappEmbeddedSignup.test.js src/screens/officeIntegrations/OfficeIntegrations.test.js src/components/navBars/data/NavBarData.officeIsolation.test.js` (9 tests). Covers policy permissions, office switching, manager checkbox persistence payload, live activation gating, Meta origin validation, popup cancellation, and callback ordering.

Build: `node node_modules/@craco/craco/dist/bin/craco.js build`. Browser preview uses the real built React screen with synthetic HTTP responses; it is not evidence of a real Meta or court connection.
