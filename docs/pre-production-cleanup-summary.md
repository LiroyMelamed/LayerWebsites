# Pre-Production Cleanup — Summary & Acceptance Checklist

> Generated after completing all 7 pre-production tasks.

---

## What Changed

### Task 1 — DB Table Usage Audit

| Item | Details |
|------|---------|
| **Report** | `docs/db-table-audit.md` — 25 tables audited, all referenced except `uploadedfiles` |
| **Migration** | `backend/migrations/2026-02-15_00_deprecate_uploadedfiles.sql` — marks legacy table (NOT RUN yet) |

### Task 2 — PlanUsage Metric Changes

| Item | Details |
|------|---------|
| **Backend** | `backend/lib/limits/getUsageForFirm.js` — removed `evidence_generation` and `evidence_cpu_seconds` queries; SMS now counts ALL SMS (`meter_key LIKE '%sms%'`); seats count Admin role only |
| **Frontend screen** | `frontend/src/screens/billingScreen/PlanUsageScreen.js` — removed evidence meters, updated SMS/seats bindings |
| **i18n** | All 3 locales updated: seats → "מנהלי מערכת" / "System admins" / "مدراء النظام"; SMS renamed; evidence keys removed |
| **API demo data** | `frontend/src/api/billingApi.js` — demo stubs updated to match new structure |

### Task 3 — Hide PlanUsage from Lawyers

| Item | Details |
|------|---------|
| **Backend** | `backend/routes/billingRoutes.js` — `requireAdmin` middleware added to all 3 billing routes |
| **Frontend nav** | `frontend/src/components/navBars/data/NavBarData.js` — PlanUsage nav item shown only when `role === 'Admin'` |
| **Roles** | `Lawyer` added to `AppRoles` enum in frontend |

### Task 4 — Excel Client Import

| Item | Details |
|------|---------|
| **Backend** | `backend/controllers/customerController.js` — `importCustomers` function: parses XLSX/CSV, maps Hebrew+English column names, detects duplicates |
| **Route** | `backend/routes/customerRoutes.js` — `POST /api/Customers/import` (admin only, multer, 5MB limit) |
| **Frontend API** | `frontend/src/api/customersApi.js` — `importCustomers(file)` method |
| **Frontend UI** | `frontend/src/screens/mainScreen/components/ImportClientsModal.js` + `.scss` — modal with file picker, upload, result summary |
| **ClientsCard** | Import button added to `ClientsCard.js` |
| **i18n** | `clientImport.*` keys added to he/en/ar locale files |
| **Dependencies** | `xlsx` and `multer` npm packages installed |

### Task 5 — Notification / Scheduled Email Reminder System

| Item | Details |
|------|---------|
| **DB Migration** | `backend/migrations/2026-02-16_00_create_scheduled_email_reminders.sql` — `scheduled_email_reminders` table with indexes and grants |
| **Templates** | `backend/tasks/emailReminders/templates.js` — 5 built-in templates (GENERAL, COURT_DATE, DOCUMENT_REQUIRED, LICENSE_RENEWAL, PAYMENT) + env-var extensibility + `renderTemplate()` + `wrapEmailHtml()` |
| **Service** | `backend/tasks/emailReminders/service.js` — worker picks PENDING rows due now, sends via `sendTransactionalCustomHtmlEmail`, advisory locks for dedup |
| **Scheduler** | `backend/tasks/emailReminders/scheduler.js` — `setInterval` poller (5min default), 7:00–21:00 window, registered in `server.js` |
| **Controller** | `backend/controllers/reminderController.js` — `getTemplates`, `importReminders` (Excel), `listReminders`, `cancelReminder` |
| **Routes** | `backend/routes/reminderRoutes.js` — mounted at `/api/reminders` (admin only) |
| **Frontend API** | `frontend/src/api/remindersApi.js` — full CRUD + import + templates |
| **Frontend screen** | `frontend/src/screens/remindersScreen/RemindersScreen.js` + `.scss` — paginated table with status filters, cancel button |
| **Import modal** | `frontend/src/screens/remindersScreen/components/ImportRemindersModal.js` + `.scss` — template picker, send-hour config, file upload, result summary |
| **Routing** | Added to `AdminStack.js` and `NavBarData.js` (admin only) |
| **i18n** | `nav.reminders` + `reminders.*` keys added to he/en/ar locale files |
| **App wiring** | `backend/app.js` — `reminderRoutes` registered; `backend/server.js` — `initEmailReminderScheduler()` called at startup |

### Task 6 — Tests

| Item | Details |
|------|---------|
| **New tests** | `backend/tests/reminderTemplates.test.js` — 7 tests covering `renderTemplate`, `getAllTemplates`, `wrapEmailHtml`, env-var merge, malformed env handling |
| **Fix** | `backend/tests/getUsageForFirm.seats.test.js` — updated stubs to match new SMS query and Admin-only seat filter |
| **Result** | **36/36 tests pass** |

---

## Files Created

| File | Purpose |
|------|---------|
| `docs/db-table-audit.md` | DB table usage audit report |
| `backend/migrations/2026-02-15_00_deprecate_uploadedfiles.sql` | Legacy table deprecation |
| `backend/migrations/2026-02-16_00_create_scheduled_email_reminders.sql` | Reminders table |
| `backend/tasks/emailReminders/templates.js` | Email templates + renderer |
| `backend/tasks/emailReminders/service.js` | Reminder send worker |
| `backend/tasks/emailReminders/scheduler.js` | Polling scheduler |
| `backend/controllers/reminderController.js` | Reminder API controller |
| `backend/routes/reminderRoutes.js` | Reminder API routes |
| `backend/tests/reminderTemplates.test.js` | Template unit tests |
| `frontend/src/api/remindersApi.js` | Reminders API wrapper |
| `frontend/src/screens/remindersScreen/RemindersScreen.js` | Reminders list screen |
| `frontend/src/screens/remindersScreen/RemindersScreen.scss` | Reminders screen styles |
| `frontend/src/screens/remindersScreen/components/ImportRemindersModal.js` | Import reminders modal |
| `frontend/src/screens/remindersScreen/components/ImportRemindersModal.scss` | Import modal styles |
| `frontend/src/screens/mainScreen/components/ImportClientsModal.js` | Import clients modal |
| `frontend/src/screens/mainScreen/components/ImportClientsModal.scss` | Import clients modal styles |

## Files Modified

| File | Change |
|------|--------|
| `backend/lib/limits/getUsageForFirm.js` | Removed evidence queries, SMS counts all, seats Admin-only |
| `backend/routes/billingRoutes.js` | Added `requireAdmin` |
| `backend/routes/customerRoutes.js` | Added import route + multer |
| `backend/controllers/customerController.js` | Added `importCustomers` |
| `backend/app.js` | Registered reminder routes |
| `backend/server.js` | Registered email reminder scheduler |
| `backend/tests/getUsageForFirm.seats.test.js` | Updated stubs for new query structure |
| `frontend/src/screens/billingScreen/PlanUsageScreen.js` | Removed evidence meters |
| `frontend/src/api/billingApi.js` | Updated demo data |
| `frontend/src/api/customersApi.js` | Added `importCustomers` method |
| `frontend/src/components/navBars/data/NavBarData.js` | Role-based filtering + reminders nav |
| `frontend/src/navigation/AdminStack.js` | Added RemindersScreen route |
| `frontend/src/screens/mainScreen/components/ClientsCard.js` | Added import button |
| `frontend/src/screens/otpScreen/*/LoginOtpScreen.js` | Added Lawyer to AppRoles |
| `frontend/src/i18n/locales/he.json` | Updated planUsage, added clientImport + reminders |
| `frontend/src/i18n/locales/en.json` | Updated planUsage, added clientImport + reminders |
| `frontend/src/i18n/locales/ar.json` | Updated planUsage, added clientImport + reminders |

---

## Acceptance Checklist

### Pre-deployment Steps

- [ ] Run the **DB migration** `2026-02-16_00_create_scheduled_email_reminders.sql` on the target database
- [ ] Optionally run `2026-02-15_00_deprecate_uploadedfiles.sql` to mark the legacy table
- [ ] Set env vars if customizing: `EMAIL_REMINDERS_SCHEDULER_ENABLED`, `EMAIL_REMINDERS_POLL_MINUTES`, `EMAIL_REMINDERS_START_HOUR`, `EMAIL_REMINDERS_END_HOUR`, `EMAIL_REMINDERS_TZ`, `EMAIL_REMINDERS_DRY_RUN`
- [ ] Optionally set `REMINDER_EMAIL_TEMPLATES` env var (JSON array) for custom templates
- [ ] Run `npm install` in `backend/` to install `xlsx` and `multer`

### Functional Tests

1. **DB Audit**: Open `docs/db-table-audit.md` and verify all 25 tables documented
2. **PlanUsage — Admin view**: Log in as Admin → navigate to "תכנית ושימוש" → verify:
   - [ ] Only 4 meters shown (documents, storage, SMS, seats)
   - [ ] No evidence meters visible
   - [ ] SMS label says "SMS (החודש)"
   - [ ] Seats label says "מנהלי מערכת"
3. **PlanUsage — Lawyer cannot access**:
   - [ ] Log in as Lawyer → "תכנית ושימוש" NOT visible in nav
   - [ ] Direct URL `/AdminStack/PlanUsageScreen` → backend returns 403
4. **Client Import**:
   - [ ] Log in as Admin → main screen → click "ייבוא לקוחות מאקסל"
   - [ ] Upload Excel/CSV with columns (שם, טלפון, אימייל, ת.ז, הערות)
   - [ ] Verify result summary shows created/skipped/failed counts
   - [ ] Verify duplicates (same phone/email) are skipped
   - [ ] Verify new clients appear in the clients list
5. **Reminders — Templates endpoint**:
   - [ ] `GET /api/reminders/templates` → returns 5 built-in templates
6. **Reminders — Import from Excel**:
   - [ ] Navigate to "תזכורות" → click "ייבוא תזכורות מאקסל"
   - [ ] Choose template, set send hour
   - [ ] Upload Excel with columns (שם לקוח, אימייל, תאריך)
   - [ ] Verify result summary
   - [ ] Verify reminders appear in the list with PENDING status
7. **Reminders — Management**:
   - [ ] Filter by status (Pending, Sent, Failed, Cancelled, All)
   - [ ] Cancel a pending reminder → verify status changes to CANCELLED
   - [ ] Pagination works when >25 rows
8. **Reminders — Scheduler**:
   - [ ] Set `EMAIL_REMINDERS_DRY_RUN=true`
   - [ ] Insert a reminder with `scheduled_for` = now
   - [ ] Wait for scheduler tick (5 min default) → verify status changes to SENT
   - [ ] Check server logs for `[email-reminders] DRY-RUN would send...`
9. **Tests**: `cd backend && npm test` → all 36 tests pass
10. **i18n**: Switch language to English / Arabic → verify all new screens render translated text

### Security Checks

- [ ] All reminder endpoints require `authMiddleware` + `requireAdmin`
- [ ] Billing routes require `requireAdmin`
- [ ] Client import requires `requireAdmin`
- [ ] File upload limited to 5MB and valid extensions only
- [ ] Scheduler uses advisory locks to prevent double-send
