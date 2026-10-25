# MelaMedia subscription notifications for legal-platform owners

This producer sends structured events to Central's system-message intake. It is
separate from case contacts, document-signing delivery, office case groups, WAHA,
and the Net HaMishpat integration. It never contacts a WhatsApp provider itself.

## Release scope and source

The isolated implementation branch is `codex/legal-system-messages-20261025`,
based on local main `fa006de6b68adbfca6feb3fe5d92bd6f89d97c91` (remote main was
verified as its ancestor `ea73e4f3` on 25 October). Working copy:
`/Users/liroymelamed/Projects/LayerWebsites/.worktrees/legal-system-messages-20261025`.
Root owns payment integration/release; the core worker owns the additive outbox.
Retire this temporary copy only after the final changes reach verified Git,
current consumers have stopped, and private evidence/environment material is
preserved. The protected older signing/QA/court checkouts are not replaced.

Vendored `backend/lib/systemMessages/vendor/` is the exact dependency-free CJS
client from Central commit `fe1f81df73892c767f9a411fad1a9a2cebc94ec6`.
`SOURCE.json` records file SHA-256 values. No unpublished registry dependency is
assumed. The client pins HTTPS origin/path, rejects redirects, validates the
strict v1 payload, checks persisted byte hashes, and signs with the dedicated
deployment HMAC. Do not edit the vendored contract locally.

Supported sources in this change:

- A genuine, verified subscription payment: `payment_received`, amount read from
  the settled payment intent in the same transaction. All `setup` intents and
  all signup verification payments are excluded. A ₪1 card verification is not
  subscription revenue.
- A completed shared signup: `subscription_update` with active status and the
  actual complimentary period end. It is queued only after the durable office
  and owner exist. There is no invented `welcome` event or arbitrary text.

Payment-due, cancellation, operational-support notices, marketing, case reminders
and other product events require their own verified source transitions. They are
not implied by the current contract supporting those message types.

## Temporary QA integration — 25 October 2026

The producer is being integrated separately onto the actual QA runtime
`7ec2217e3015706ef78bf1344ccefe0a3e224866`, in branch
`codex/legal-system-messages-qa-20261025`, worktree
`/Users/liroymelamed/Projects/LayerWebsites/.worktrees/legal-system-messages-qa-20261025`.
Root owns this temporary QA candidate; preserve the main-based implementation and
all protected signing/court copies. Retire it only after verified Git preservation,
consumer shutdown and private evidence/rollback preservation.

Do not replace QA with the main-based producer branch: those histories diverged,
and that replacement would remove the existing office WAHA connection and safety
code. This QA candidate carries only the reviewed producer change, preserves the
incumbent signup behavior, locales, dependencies, branding and index recovery, and
adds a separate consent-payload test instead of main-only attribution tests.
Capture and dispatch remain OFF. Central keys and the additive tables are not
required for a strictly OFF code deployment; both are required before activation.
No activation, provider message or customer rollout is inferred from local tests.

## Defaults and trusted deployment configuration

All new capture and dispatch is **off by default**. Imports/default-off payment
calls do not query the new tables or open a provider connection.

| Variable | Meaning |
| --- | --- |
| `CENTRAL_SYSTEM_MESSAGES_CAPTURE_ENABLED` | Exact `true` enables explicit consent/event persistence. |
| `CENTRAL_SYSTEM_MESSAGES_DISPATCH_ENABLED` | Exact `true` permits bounded Central intake attempts. Requires capture. |
| `CENTRAL_SYSTEM_MESSAGES_DEPLOYMENT_ID` | Approved Central deployment slug, from operator configuration only. |
| `CENTRAL_SYSTEM_MESSAGES_MODE` | `dedicated` or `sharedsignup`, matched against actual multi-tenant mode. |
| `CENTRAL_SYSTEM_MESSAGES_OWNER_USER_ID` | Dedicated deployment's one explicitly configured SaaS account owner. Must be an active platform admin with a verified local user row. |
| `CENTRAL_SYSTEM_MESSAGES_HMAC_KEY` | Dedicated 32–8192 character intake secret. Never reuse service/support/monitor/another deployment key. Never log it. |
| `BACKGROUND_JOBS_ENABLED` | Must be exact `true` for the automatic timer to start. |

Shared mode additionally requires the existing `MULTI_TENANT_MODE=true` and
`TENANT_DB_ISOLATION_ENABLED=1`. Its recipient is the office's actual
`law_firm_tenants.owner_user_id` joined to the same-office user; it is not all
admins, all clients, the checkout actor, or an office WhatsApp add-on buyer.

Use a separate Central identity/key for each dedicated branded deployment and a
distinct shared-signup identity/key. The body does not support office IDs,
instance IDs, arbitrary portals, sender numbers or templates. Office identity is
enforced internally; Central binds the signed deployment to a fixed instance and
portal. Shared dynamic office portals are not expressible in this v1 body.
Operator-approved Central identity/key/static portal mapping and activation are
separate outstanding prerequisites; this source change does not provision them.
Never infer permission to send from successful local tests or an existing
case-group phone connection.

## Explicit consent

Consent version is `melamedia-transactional-whatsapp-v1`. The optional choice is
separate from mandatory billing consent, signup, card saving, a WhatsApp add-on,
and sender pairing. Existing accounts are not backfilled or opted in.
The optional registration checkbox is captured by the existing signup request.
The owner preference on PlanUsage uses `/api/billing/system-message-consent`
after authentication; that API accepts the boolean, consent version and action
UUID, never an alternate recipient.

The authenticated action is bound to the exact current owner and phone, server
capture time, version, and stable source-action UUID. The service resolves the
database contact and rejects an alternate contact supplied by the caller. The
same action with changed semantics is a conflict; replaying an old grant never
overwrites a subsequent opt-out. New older/equal capture times cannot overwrite
newer consent. A persisted signup capture time is preserved at provisioning,
even when it has become too old for Central; it is never refreshed silently.

Withdrawal cancels local pending notices and queues a durable Central withdrawal
event. An explicit fresh grant for a changed phone separately withdraws the old
verified grant and grants the new number. A changed/deleted owner, changed phone,
or unsupported label suppresses optional messaging without failing an otherwise
verified payment. Database failures while persisting a valid eligible notice
remain atomic failures: settlement and its outbox commit together or neither
commits. An accepted Central queue is owned by Central: disabling only this
local dispatcher does not retract previously accepted notices. For an immediate
global stop, disable that deployment in Central; inbound WhatsApp STOP is also
globally enforced there and cannot be cleared by a product opt-in.

## Persistence, retries and recovery

Apply `backend/migrations/2026-10-25_system_messages.sql` as the established
billing data owner/migration operator, not by making the runtime the data owner.
It creates private office-scoped consent and outbox tables. Ownership and explicit
CRUD app-role ACLs follow `firm_billing`; PUBLIC gets no grant. The incumbent
restrictive office policy and immutable-office trigger are installed when shared
isolation functions exist. Startup classification must include both tables in
`backend/lib/tenant/isolationSchema.js`. The prepared event's identity, payload,
source, office, amount/time snapshot and checksum are immutable in SQL.

`setConsent`, `enqueuePaymentReceived`, and `enqueueSubscriptionUpdate` take the
caller's transaction client. Do not enqueue from a best-effort audit logger or
after committing the verified source transaction. A payment event re-reads the
persisted succeeded intent and original `settled_at`; never replace old source
time with a new time to make historical events deliverable.

Source uniqueness includes deployment, office, event family, source transition
and intended recipient. The random event UUID and exact UTF-8 prepared body are
persisted once. Later attempts restore those same bytes; only authentication
timestamp/signature are fresh. Central deduplicates by deployment/event UUID and
payload hash. Its receipt proves **intake acceptance, not WhatsApp delivery**.

The unref'ed 15-second timer permits no overlapping local flush. A claim commits
a `sending` marker and lease before any intake POST. `FOR UPDATE SKIP LOCKED`, a
per-office action lock, current owner/contact/consent checks, and an acknowledged
grant precede dispatch. The bounded POST holds the consent action lock so a
withdrawal cannot commit in the gap before it. A stale committed marker is
conservatively a possible Central acceptance, including a crash before receipt
commit. Recovery repeats only that exact event, never a new UUID.

Network/timeout/408/5xx/malformed receipts and 429 receive a bounded same-event
retry with backoff. Definite rejections are retained for reconciliation. At most
eight conservative attempts/recoveries are allowed per event. Accepted events are
not sent again. Never-accepted events outside Central's five-minute freshness
window are retained for reconciliation, with original bytes unchanged. A known
accepted event can recover its identical receipt after that window; unknown
outcomes may attempt that same-event receipt recovery and remain rejected or
uncertain if Central never accepted it. There is no re-dating or backfill.

Stale explicit-consent capture may require the owner to make a new consent action.
Do not generate fresh proof automatically. Owner/contact/config/source drift,
expired consent dependency and conflicting receipts require review rather than
creating replacement events. No raw body, phone, account name, HMAC, provider
response or exception text belongs in operational logs.

`getConsent()` returns `confirmationRequired: true` and operational
`optedIn: false` when a recorded grant is stale and unacknowledged, missing, or
terminal. A long signup checkout therefore leaves the original proof intact and
offers a fresh optional choice after owner login. Payments continue without an
ineligible optional notice. Fresh explicit withdrawals do not wait for a stale
historical consent event; Central's monotonic capture time and the latest local
grant prevent replay from reversing newer choices.

Rollback: disable capture/dispatch, stop the new timer, retain the additive
tables/history and the previously reviewed code rollback. Central deployment
disable is needed to stop its already accepted queue. Do not drop the tables or
rewrite outbox statuses/UUIDs as part of ordinary code rollback.

## Focused verification

New core scenarios use the declared PGlite version and a fake Central intake, with
synthetic identities only. Run the exact focused file (after reading the signing
and office-WhatsApp test ledgers):

```sh
NODE_ENV=test node --test backend/tests/systemMessagesOutbox.test.js
```

Dependencies may live in the existing isolated test cache via `NODE_PATH`; no
production environment or DB is required. Every actual attempt/failure is logged
under the root task's `outputs/legal-system-messages-20261025/core/` and appended
to both existing ledgers. Tests bind working source hashes and base commit;
changing service/config/migration/source integrations or dependencies invalidates
the affected evidence. Fake intake tests are not a real payment, provider,
WhatsApp delivery, customer rollout, or production approval.
