# Settings consumer regression checks

These tests exercise saved settings against actual HTTP controllers, PostgreSQL queries, calendar message composition and the SMS provider payload builder. They do not send messages to a provider.

## Isolated database

Use an empty, migrated **schema-only** copy of the application database on a dedicated local PostgreSQL instance at `127.0.0.1:55439`, database `codex_settings_20261006`, user `postgres`. Do not copy customer rows or production secrets. The preload replaces inherited provider/DB credentials, disables dotenv, rejects external/default-port connections and checks the exact disposable database. Tests require empty fixture tables and remove their own inserted rows.

The initial verification used a schema-only restore; its PostgreSQL-version `transaction_timeout` warning did not affect schema objects. Use a matching PostgreSQL version when regenerating the schema.

Run from `backend/`, sequentially:

```sh
TZ=Asia/Jerusalem node --require ./tests/helpers/settingsIsolation.js --test tests/messageSettingsConsumers.integration.test.js
TZ=Asia/Jerusalem node --require ./tests/helpers/settingsIsolation.js --test tests/caseNotificationSettings.integration.test.js
TZ=UTC node --require ./tests/helpers/settingsIsolation.js --test tests/caseNotificationSettings.integration.test.js
TZ=Asia/Jerusalem node --require ./tests/helpers/settingsIsolation.js --test tests/signingMessageSettings.integration.test.js
```

The case suite catches calendar DATE conversion regressions: updating a company name or license date must not resend an estimated-completion notification when the calendar date did not change. The message suite checks appointment/hearing invitation/reminder templates, address/navigation changes, phone-meeting suppression, customer welcome and SMS sender selection.

Validated on 2026-10-06: 8 message-consumer checks; 13 case-workflow checks in each timezone. Provider calls are captured at their boundary; real SMS delivery is a separate gate. Platform-setting UI, mobile visibility, PDF geometry and store delivery are separate acceptance tests, not implied by these results.

Signing message coverage: new invitations, changed-template resend, due reminders, OTP-authorized completion for office and signer, and rejection reason. Five checks pass with synthetic PostgreSQL rows, in-memory object storage and captured provider calls. The consumer-only Express harness explicitly supplies synthetic roles; separate suites cover access control.
