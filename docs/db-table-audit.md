# Database Table Usage Audit

**Date:** 2026-02-15  
**Schema:** public (PostgreSQL)  
**Total tables:** 25

---

## Summary

All 25 tables are referenced in the codebase. **1 table (`uploadedfiles`) appears to be legacy** with no active read/write operations in application code.

---

## Used Tables (with reference locations)

### 1. `audit_events`
**Status: ✅ Actively used**  
**Used by:** Signing evidence, audit log viewer, retention cleanup

| Area | Files |
|------|-------|
| Controllers | `signingFileController.js` (SELECT, INSERT — evidence pack), `auditEventsController.js` (list/export), `customerController.js` (pre-delete check) |
| Utils | `auditEvents.js` (`recordAuditEvent`, `getRecentAuditEvents`), `legalData.js` (existence check) |
| Scripts | `retentionCleanup.js`, all reset scripts |
| Migrations | `2026-01-11_00` (CREATE), `2026-01-16_01` (trigger/policy) |

**Recommendation:** Keep.

---

### 2. `casedescriptions`
**Status: ✅ Actively used (core)**

| Area | Files |
|------|-------|
| Controllers | `caseController.js` (JOIN, INSERT, UPDATE, DELETE), `adminController.js` (DELETE cascade), `customerController.js` (DELETE cascade), `caseTypeController.js` (DELETE cascade) |
| Scripts | All reset/cleanup scripts |

**Recommendation:** Keep.

---

### 3. `cases`
**Status: ✅ Actively used (core)**

| Area | Files |
|------|-------|
| Controllers | `caseController.js` (full CRUD), `customerController.js` (DELETE cascade), `caseTypeController.js` (cascade) |
| Tasks | `licenseRenewal/service.js` (SELECT with JOIN) |
| Utils | `legalData.js` (existence check) |
| Lib | `getUsageForTenant.js` (usage counting) |
| Frontend | casesApi, AllCasesScreen, MyCasesScreen, MainScreen, CaseFullView |

**Recommendation:** Keep.

---

### 4. `casetypedescriptions`
**Status: ✅ Actively used**

| Area | Files |
|------|-------|
| Controllers | `caseTypeController.js` (full CRUD: JOIN, INSERT, UPDATE, DELETE) |

**Recommendation:** Keep.

---

### 5. `casetypes`
**Status: ✅ Actively used (core)**

| Area | Files |
|------|-------|
| Controllers | `caseTypeController.js` (full CRUD), `caseController.js` (JOIN) |
| Utils | `caseTypesCache.js` (caching layer) |
| Tests | `cache.caseTypes.test.js` |
| Frontend | casesTypeApi, AllCasesTypeScreen, CaseTypeFullView |

**Recommendation:** Keep.

---

### 6. `data_retention_runs`
**Status: ✅ Actively used (operational/admin)**

| Area | Files |
|------|-------|
| Scripts | `retentionCleanup.js` (INSERT run records) |
| Migrations | `2026-01-16_00` (CREATE) |

**Recommendation:** Keep.

---

### 7. `firm_plan_overrides`
**Status: ✅ Actively used (admin/platform)**

| Area | Files |
|------|-------|
| Controllers | `platformAdminController.js` (`upsertFirmOverride` — INSERT) |
| Lib | `resolveFirmPlan.js` (SELECT) |

**Recommendation:** Keep.

---

### 8. `firm_signing_policy`
**Status: ✅ Actively used (firm config)**

| Area | Files |
|------|-------|
| Lib | `resolveFirmSigningPolicy.js` (SELECT) |
| Migrations | `2026-01-17_00` (CREATE) |

**Recommendation:** Keep.

---

### 9. `firm_subscriptions`
**Status: ✅ Actively used (billing/plan)**

| Area | Files |
|------|-------|
| Controllers | `platformAdminController.js` (INSERT/UPSERT) |
| Lib | `resolveFirmPlan.js` (SELECT with JOIN to subscription_plans) |
| Scripts | `retentionCleanup.js`, reset scripts |

**Recommendation:** Keep.

---

### 10. `firm_usage_events`
**Status: ✅ Actively used (billing/metering)**

| Area | Files |
|------|-------|
| Lib | `recordFirmUsage.js` (INSERT), `getUsageForFirm.js` (SELECT — documents, SMS, emails) |
| Scripts | `firmBackfill.js` (validation) |

**Recommendation:** Keep.

---

### 11. `firm_users`
**Status: ✅ Actively used (firm membership)**

| Area | Files |
|------|-------|
| Lib | `resolveFirmContext.js` (INSERT — auto-enroll), `getUsageForFirm.js` (SELECT — seat counting) |
| Scripts | `retentionCleanup.js`, `firmBackfill.js`, reset scripts |
| Tests | `getUsageForFirm.seats.test.js` |

**Recommendation:** Keep.

---

### 12. `firms`
**Status: ✅ Actively used (multi-tenant core)**

| Area | Files |
|------|-------|
| Controllers | `platformAdminController.js` (list/upsert firms) |
| Lib | `resolveFirmContext.js` (SELECT + INSERT), `resolveFirmPlan.js` (SELECT) |

**Recommendation:** Keep.

---

### 13. `otps`
**Status: ✅ Actively used (authentication)**

| Area | Files |
|------|-------|
| Controllers | `authController.js` (INSERT, SELECT, DELETE — OTP flow), `customerController.js` (DELETE on user removal), `adminController.js` (DELETE) |
| Frontend | LoginScreen, OtpScreen |

**Recommendation:** Keep.

---

### 14. `refresh_tokens`
**Status: ✅ Actively used (authentication)**

| Area | Files |
|------|-------|
| Controllers | `authController.js` (INSERT, SELECT, UPDATE — token lifecycle) |
| Migrations | `2026-01-08_00` (CREATE), `2026-01-08_01` (grants) |

**Recommendation:** Keep.

---

### 15. `signaturespots`
**Status: ✅ Actively used (signing core)**

| Area | Files |
|------|-------|
| Controllers | `signingFileController.js` (full CRUD — signature spots management) |
| Migrations | `2025-12-23_01`, `2026-01-15_00` |

**Recommendation:** Keep.

---

### 16. `signing_consents`
**Status: ✅ Actively used (signing evidence)**

| Area | Files |
|------|-------|
| Controllers | `signingFileController.js` (SELECT, INSERT — consent recording) |
| Scripts | `retentionCleanup.js` (DELETE) |

**Recommendation:** Keep.

---

### 17. `signing_otp_challenges`
**Status: ✅ Actively used (signing OTP)**

| Area | Files |
|------|-------|
| Controllers | `signingFileController.js` (full challenge flow) |
| Scripts | `retentionCleanup.js` (DELETE) |

**Recommendation:** Keep.

---

### 18. `signing_retention_warnings`
**Status: ✅ Actively used (admin/retention)**

| Area | Files |
|------|-------|
| Controllers | `platformAdminController.js` (LEFT JOIN, INSERT) |
| Migrations | `2026-01-16_02` (CREATE) |

**Recommendation:** Keep.

---

### 19. `signingfiles`
**Status: ✅ Actively used (signing core — heaviest usage)**

| Area | Files |
|------|-------|
| Controllers | `signingFileController.js` (26+ SQL refs), `auditEventsController.js` (JOIN), `evidenceDocumentsController.js` (SELECT) |
| Lib | `getUsageForTenant.js`, `getUsageForFirm.js` (usage counting) |
| Utils | `legalData.js` (existence check) |
| Scripts | `retentionCleanup.js`, `firmBackfill.js`, all reset scripts |
| Frontend | signingFilesApi, SigningScreen, SigningManagerScreen |

**Recommendation:** Keep.

---

### 20. `subscription_plans`
**Status: ✅ Actively used (billing/plan definitions)**

| Area | Files |
|------|-------|
| Controllers | `platformAdminController.js` (SELECT, INSERT), `billingController.js` (SELECT) |
| Lib | `resolveTenantPlan.js`, `resolveFirmPlan.js`, `getLimitsForTenant.js` |

**Recommendation:** Keep.

---

### 21. `tenant_subscriptions`
**Status: ✅ Actively used (billing)**

| Area | Files |
|------|-------|
| Controllers | `adminController.js`, `platformAdminController.js` (INSERT/UPSERT) |
| Lib | `resolveTenantPlan.js` (SELECT JOIN) |
| Scripts | `retentionCleanup.js` |

**Recommendation:** Keep.

---

### 22. `uploadedfiles`
**Status: ⚠️ Possibly legacy / deprecated**

| Area | Files |
|------|-------|
| Controllers | `caseTypeController.js` (DELETE cascade only — when deleting a case type) |
| Scripts | Reset scripts (TRUNCATE) |
| Schema | `melamedlaw.sql` (CREATE, FK to cases) |

**Key finding:** `filesController.js` has **zero** SQL references to `uploadedfiles`. No INSERT or SELECT found anywhere in active application code. File uploads now use R2 presigned URLs directly, bypassing this table entirely. The only operational reference is a cascade DELETE.

**Recommendation: 🔶 Deprecate**
1. The table holds no active data in current workflows.
2. DO NOT DROP yet — verify no production rows exist first.
3. Prepared migration script: `migrations/2026-02-15_00_deprecate_uploadedfiles.sql` (NOT RUN YET).
4. After verifying zero rows in production, can proceed with DROP.

---

### 23. `userdevices`
**Status: ✅ Actively used (push notifications)**

| Area | Files |
|------|-------|
| Controllers | `notificationController.js` (INSERT, UPDATE — FCM token registration), `customerController.js` (DELETE), `adminController.js` (DELETE) |
| Services | `notificationOrchestrator.js` (SELECT FCM tokens) |
| Tasks | `licenseRenewal/service.js` (SELECT FCM tokens) |

**Recommendation:** Keep.

---

### 24. `usernotifications`
**Status: ✅ Actively used (in-app notifications)**

| Area | Files |
|------|-------|
| Controllers | `notificationController.js` (SELECT, UPDATE — list/mark-read), `customerController.js` (DELETE), `adminController.js` (DELETE) |
| Utils | `sendAndStoreNotification.js` (INSERT) |
| Frontend | NotificationsScreen |

**Recommendation:** Keep.

---

### 25. `users`
**Status: ✅ Actively used (core — heaviest usage)**

| Area | Files |
|------|-------|
| Controllers | `authController.js` (SELECT, INSERT), `customerController.js` (full CRUD), `adminController.js` (full CRUD), `signingFileController.js` (name/email lookups), `caseController.js` (name lookups), `dataController.js` (user lists) |
| Services | `notificationOrchestrator.js` (user details) |
| Tasks | `licenseRenewal/service.js` (JOIN) |
| Lib | `getUsageForFirm.js` (seat counting) |
| Frontend | customersApi, adminApi, loginApi, ProfileScreen, many screens |

**Recommendation:** Keep.

---

## Classification Summary

| Classification | Tables |
|---|---|
| **Core / Active** | `users`, `cases`, `casedescriptions`, `casetypes`, `casetypedescriptions`, `otps`, `refresh_tokens`, `signingfiles`, `signaturespots`, `signing_consents`, `signing_otp_challenges`, `audit_events`, `userdevices`, `usernotifications` |
| **Billing / Plan** | `subscription_plans`, `tenant_subscriptions`, `firm_subscriptions`, `firm_plan_overrides`, `firm_usage_events` |
| **Multi-tenant / Firm** | `firms`, `firm_users`, `firm_signing_policy` |
| **Operational / Admin-only** | `data_retention_runs`, `signing_retention_warnings` |
| **Legacy / Deprecate** | `uploadedfiles` |

---

## Prepared Migration (NOT RUN YET)

File: `migrations/2026-02-15_00_deprecate_uploadedfiles.sql`

This migration adds a deprecation comment to the table. A future migration can DROP it after confirming zero production rows.
