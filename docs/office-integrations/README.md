# Office connections: Net HaMishpat demo and official WhatsApp

Implemented on `codex/office-integrations`, based on `main`, and deployed to Melamedia QA. Validation uses synthetic court data and fake WhatsApp providers. Connection-only QA permits an explicitly authorized real WhatsApp signup while blocking all messages and group creation.

## Official QR connection test (2026-10-15)

The office-owner screen offers **Connect WhatsApp with QR**, using Embedded Signup **v4**, session information v3 and `featureType=whatsapp_business_app_onboarding`. This links a number already active in WhatsApp Business; a brand-new number must first be activated on the phone. The QR is issued by Meta inside its flow, subject to eligibility; it is not an unofficial linked-device session. Business verification for MelaMedia is currently **In review** and the Tech Provider/App Review prerequisites remain incomplete. Availability for the app's admin must be tested; external customer readiness is not claimed.

QA flags: `WHATSAPP_DEMO_ONLY=false`, `WHATSAPP_CONNECT_ONLY=true`, `WHATSAPP_SIGNUP_FLOW=business_app`, `WHATSAPP_LIVE_ENABLED=false`, `WHATSAPP_WORKER_ENABLED=false`, `BACKGROUND_JOBS_ENABLED=false`, `QA_OUTBOUND_MODE=noop`, empty `QA_OUTBOUND_ALLOW`. Provider, enqueue and worker independently enforce the send restriction. The demo worker still runs simulations with `WHATSAPP_DEMO_WORKER_ENABLED=true`. `COURT_DEMO_CASE_LINKING=true` preserves synthetic court testing independently of WhatsApp authentication.

Coexistence completion handles `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`, verifies the token's app/WABA grants and resolves an omitted phone ID only when exactly one verified app number exists. It never registers that phone again. The encrypted authorization is saved in the authenticated office before the required `smb_app_data` contacts/history handshake, with no blind POST retries. A handshake failure remains visible as `needs_attention`; checking connection does not retry it. Subscribe to `account_update`, `history`, `smb_app_state_sync` and `smb_message_echoes` before testing. Signed callbacks keep only synchronization status and discard contact/chat content; this is a connection test, not a conversation inbox. Decline history sharing in the Meta flow. Full conversation mirroring is outside this test.

Connecting is separate from group eligibility. Coexistence accounts cannot enable the existing group API automation. Local disconnect deletes the saved grant; unlinking the Business app itself is done on the phone under Settings → Account → Business Platform. No office is connected until the person completes Meta's authorization on their phone.

Official references: [Business app onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users), [Embedded Signup implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation).

An actual launch from QA reached Meta's message that **MelaMedia cannot onboard customers at this time**. Keep `WHATSAPP_META_APPROVAL_PENDING=true` until the business/application prerequisites are approved and retested. The visible QR button explains that it is waiting for Meta; the backend rejects new signup sessions rather than launching a known-blocked flow repeatedly.

### Proposed add-on price (QA display only)

The owner delegated pricing calculation and then confirmed that MelaMedia is an exempt business and does not charge VAT. The proposal is **ILS 99 per office per month, no VAT added**, one office number, **ILS 0 setup**, with Meta's usage costs separate and paid directly to Meta. This adds to the existing subscription. `WHATSAPP_PRICING_PREVIEW=true` exposes the proposal from `backend/config/whatsappPricing.js`; it does not create a subscription, collect payment, or activate a paid service. No customer has been charged.

Planning assumptions, not measured costs: ILS 8 infrastructure/monitoring allocation per office/month + 10 minutes support at ILS 120/hour (ILS 20) + 45 minutes initial assistance amortized over six months (ILS 15/month) = ILS 43/month. At ILS 99, the estimated contribution is ILS 56/month before acquisition costs, broader overhead and taxes. Zero setup reduces friction; review actual support use and churn before commercial rollout. Meta charges are excluded so messaging volume does not erode this estimated margin.

Meta's [official pricing page](https://whatsappbusiness.com/products/platform-pricing/) describes prices varying by recipient market and message category. The UI links there and does not hardcode per-message prices or promise free/unlimited messages. Full billing and contract acceptance remain outside this display-only QA change.

## Company, product and customer identity

Confirmed by the owner on 2026-10-15:

| Company | Project key / name | Product | Example customer |
| --- | --- | --- | --- |
| MelaMedia | `melamedlaw` / MelamedLaw | Legal practice management | MelamedLaw (a separate office identity) |
| MelaMedia | `makeappointment` / MakeAppointment | Appointment booking | FitBase |
| MelaMedia | `melamotion` / MelaMotion | Studio management | Each subscribing studio |

This repository implements the **MelamedLaw project**. Its product identity does not come from tenant branding. The existing production client/branch/database named MelamedLaw is one customer of that project; the Melamedia deployment remains its separate QA environment. FitBase is a MakeAppointment customer, not a legal-project tenant. Existing Meta apps, including the live FitBase app, are not renamed, moved or retired by this change.

MelaMedia owns the Meta business portfolio (2123754728517069). Each independent project uses its own Meta app. The **MelamedLaw** app was created on 2026-10-15 with ID **1132509735911115** and contact email **liroy@mela-media.co.il**; it remains unpublished. Customers authorize their own WhatsApp accounts and numbers through the project's app. No separate developer app is required per customer. Creating the project app does not connect any office or authorize real delivery. Meta currently requires business verification, app review and access verification before external customer onboarding.

Platform Settings is the **office owner's** settings screen, not MelaMedia's customer-management console. It loads the authenticated office directly, with no customer selector, company/project card or Meta developer setup checklist. Office grants, signup sessions, defaults, managers, court schedules and case jobs use immutable office UUIDs in shared deployments, or the isolated database in dedicated deployments; display names never select an office. Missing office context fails closed instead of choosing the first customer. The provider-only targeting API remains separate from this customer UI; owners cannot target another office.

This is not a new cross-project management console. Before live onboarding across the existing dedicated customer databases, the project needs one authenticated webhook routing service/connection registry, or a reviewed shared deployment. The current webhook handler routes office assets inside one deployment only. Never overwrite the project's callback per customer or merge customer databases to work around routing. The existing QA remains dedicated and uses no real customer credentials.

## User flow

- Platform settings → **חיבורים למשרד**. The office is determined from the authenticated session/deployment. Owners manage their own connection, synchronization time and group defaults. The company/project/customer hierarchy is an internal provider concern.
- Court: save the demo connection and its daily synchronization time. Court numbers are entered on the case create/edit form. The synthetic feed matches those references; repeated syncs do not duplicate events. The case view shows imported demo updates to authorized staff. Test seeding and manual synchronization endpoints remain available for controlled QA, not on the connection settings screen.
- WhatsApp: the owner opens the official Meta Embedded Signup window, chooses the business and number, and grants access. The server exchanges the one-use code, validates app permissions and asset ownership, registers the number if necessary, subscribes to the WABA, and encrypts the grant per office. No customer copy/paste of access tokens is needed.
- The office owner saves the default invitee numbers, optionally checks **הזמן אוטומטית גם את מנהל התיק**, and enables/disables automatic groups. The manager is resolved from `cases.casemanagerid` and their own office's `users.phonenumber` when the case is created. Numbers are normalized and deduplicated. With the manager enabled, up to six fixed invitees can be saved; otherwise up to seven. Manager-only invitations are supported.
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

The office-connections UI loads `/office-integrations/settings` without an office selector and contains connection and automation settings only. Court mappings, test-case buttons and activity tables are absent; case records retain their own integration activity. The settings endpoint does not fetch those operational records. Verified office owners can change their own daily schedule and recipient policy; staff and foreign-office selectors are rejected. WhatsApp has a direct connection button when available, and a short owner-focused guide in QA. Developer app setup stays out of this screen. Environment flags determine demo/live mode; changing environment never silently enables real groups from an enabled demo configuration. Invitation details are collapsed and shown only for connected live accounts.

Apply `2026-10-15_01_court_daily_sync.sql` for persisted daily scheduling. Existing enabled court demo connections default to 08:00 in `Asia/Jerusalem`, editable per office. Enable `COURT_DEMO_SYNC_WORKER_ENABLED=true` to poll every minute independently of message-delivery jobs. This worker only imports synthetic court data. A transaction locks the connection, imports idempotently and advances its next execution together. Restarts catch up once; multiple workers, time edits and daylight-saving changes cannot cause a second scheduled run in the same local day. Disabling clears the next execution. Failed transactions remain due for the next tick.

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

Frontend: `npm test -- --watch=false --runInBand --runTestsByPath src/services/whatsappEmbeddedSignup.test.js src/screens/officeIntegrations/OfficeIntegrations.test.js src/components/navBars/data/NavBarData.officeIsolation.test.js`. Covers authenticated-office settings, no customer-list fallback, manager checkbox persistence, live activation gating, direct signup, Meta origin validation, popup cancellation, and callback ordering.

Build: `node node_modules/@craco/craco/dist/bin/craco.js build`. Browser preview uses the real built React screen with synthetic HTTP responses; it is not evidence of a real Meta or court connection.
