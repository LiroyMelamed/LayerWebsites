# Calendar invitations, reminders, signing usage and mobile direction — 4 November 2026

Candidate work, not a deployment receipt. Product source must reach main, then Melamedia QA, before active customer branches.

## Web/API changes

- Dedicated-office signing can be enabled independently of its paid document pack. The opt-in `firm_billing.signing_auto_tier_enabled` selects upward signing tiers from successful document creation (legacy, committed packages and published replacements), with a durable monthly meter. Failed transactions roll back the meter and tier together. Storage/SMS limits and the explicit operational signing disable remain enforced. Complimentary periods, renewal dates and payment-provider state are unchanged; this migration does not charge a card or downgrade purchased packs.
- Calendar reminders no longer participate in appointment conflicts. Lawyer/client timing selections determine their respective audiences, without a second target selector. Available timing options and new-event defaults are separate settings; existing events retain their own choices.
- The reminder form exposes weekly/daily/monthly recurrence through a chosen end date. Each occurrence can have its own linked reminder, created in the same transaction as the series.
- An explicit invitation checkbox is independent of reminder timings. Email invitations contain a standard iCalendar REQUEST with a stable per-office event UID and one recipient. Internal case notes and other recipients' contact details are omitted.
- ICS import previews before saving to the authenticated user's calendar. The import never sends RSVP or executes alarms/fetches attachments. Google and ICS identity use UID and occurrence identity, with owner isolation, revision checks and transactional deduplication. Imports cover 30 days back through one year ahead. Existing pre-upgrade Google rows must be synchronized once before ICS import; the UI explains this prerequisite. Cancellations affect existing linked events, not unrelated meetings. Manual cancellations remain cancelled.
- Signing list styling follows the other list pages. The calendar toolbar is compact and responsive, and its all-day region is reduced.
- The shared email sender makes legacy fixed-width tables fluid and wraps long text, retaining branding and links. Android Gmail device confirmation is separate from browser rendering tests.

## Migration order

1. Install the exact backend lockfile, including `ical.js`.
2. Apply `2026-11-04_00_automatic_signing_tiers.sql`, `2026-11-04_01_calendar_invitations.sql`, `2026-11-04_02_calendar_reminder_defaults.sql`, `2026-11-04_03_calendar_signing_runtime_grants.sql`.
3. Enable automatic signing tiers only for the intended dedicated office after QA qualification. Existing billing row and complimentary details must be recorded before and verified after.
4. Restart only the tenant API. Publish its branded frontend while retaining old immutable chunks and root assets.

## Evidence to date

- Automatic signing policy/quota tests and actual PostgreSQL migration/concurrency checks passed in isolated schemas; no real charge.
- Invitation MIME/parser/timezone/recurrence, Google pagination and responsive email unit checks passed.
- PostgreSQL import checks cover simultaneous repeat, revision order, rollback, cross-source identity, owner separation, cancellation and actual conflict SQL.
- Frontend default-reminder and calendar/signing-list tests passed; production frontend build passed.
- Native source patch is tracked separately in LawyerApp: OTP LTR row and logical document coordinates. 167 native source tests and both-platform Expo export passed. These do not establish installed Android/iOS behavior.

Evidence is stored outside the source tree in `~/.cache/melamedia-builds/automatic-signing-tier-20261104` and `~/.cache/melamedia-builds/native-rtl-20261104`, with signing ledger entries in the protected implementation ledger. Live UI, actual Gmail Android, signed native binaries, customer deployment and release tags must not be inferred from these source checks.

This release targets the four active dedicated databases only. It does not qualify the separate shared-office database deployment; its isolation schema gate must continue rejecting these unclassified new tables until a separate RLS migration and multi-office tests are reviewed. The runtime-grant migration copies only existing non-PUBLIC DML grants from each parent table; it does not create roles or change authentication.
