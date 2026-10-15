# Firm permission — page / nav inventory (audit)

**Date:** 2026-10-05  
**Catalog source:** `backend/lib/firmRolePermissions.js` (v1)  
**Office shell:** `AdminStack` (+ `ClientStack` for end clients and **legacy Lawyer login**)

## Product target (final)

When `users.firm_staff_role_id IS NOT NULL`, **only** the assigned role matrix (+ Platform Admin override) defines pages, actions, and API access. `users.role` is identity/legacy only.

When `firm_staff_role_id IS NULL` → **temporary rollout** legacy (today: `requireFirmAction` legacy rules by `users.role`). Not final model.

---

## Inventory table

| Page (HE / product) | navKey | Route (AdminStack) | Assignable? | Area / actions (catalog) | PlatformAdminOnly today? | In catalog v1? |
|---------------------|--------|--------------------|-------------|---------------------------|---------------------------|----------------|
| ראשי / לוח בקרה | `main` | `/MainScreen` | Yes | `main` (visible only) | No | Yes |
| כל התיקים | `allCases` | `/AllCasesScreen` | Yes | `cases`: view, create, edit, delete, tag + dataScope | No | Yes |
| תיקים מתויגים | `taggedCases` | `/TaggedCasesScreen` | Yes | `cases.view` (+ scope) | No | Yes (navKey only; **no navbar item**) |
| התיקים שלי | `myCases` | `/MyCases` | Yes | `cases.view` | No | Yes (navKey only; **no navbar item**) |
| תיק חדש / עדכון (popup) | `newOrUpdateCase` | popup | Yes | `cases.create` **or** `cases.edit` | No | Yes |
| לקוחות | `allClients` | `/AllClientsScreen` | Yes | `clients`: view, edit, delete | No | Yes |
| סוגי תיקים | `allCaseTypes` | `/AllCasesType` | Yes | `caseTypes`: view, manage | No | Yes |
| חתימות | `signingFiles` | `/SigningManagerScreen` | Yes | `signing`: view, manage, upload | No | Yes |
| העלאת חתימה | `uploadFileForSigning` | `/UploadFileForSigningScreen` | Yes | `signing.upload` or `signing.manage` | No | Yes |
| תצוגת חתימה (spots) | — | `/SigningSpotsPreview/:id` | Yes | `signing.view` | No | Partial (mapped as `signingFiles`) |
| תזכורות | `reminders` | `/RemindersScreen` | Yes | `reminders`: view, manage | No | Yes |
| יומן | `calendar` | `/CalendarScreen`, `/calendar/day/:date` | Yes | `calendar`: view, manage | No (module flag) | Yes |
| תמיכה (משרד) | `support` | `/support` | Yes | `support`: view | No | Yes |
| מסמכי ראיות | `evidenceDocuments` | `/EvidenceDocumentsScreen` | **Assignable** | `evidenceDocuments` (`view`, `download`) | **Role matrix** | **Yes** |
| תוכנית ושימוש / תמחור | `planUsage` | `/PlanUsage`, `/PlansPricing` | **PA-only** | **Not in catalog** | **Yes** | **No** |
| משתמשי משרד | `allManagers` | `/AllManger` | No (PA assigns on cards) | — | No (legacy Admin sees all) | **No** |
| תפקידים והרשאות | `firmStaffRoles` | `/FirmStaffRoles` | No | — | Yes | **No** (correct) |
| הגדרות פלטפורמה | `platformSettings` | `/PlatformSettingsScreen` | No | — | Yes | **No** (correct) |
| אין הרשאות | `noPermissions` | `/NoPermissions` | — | — | — | Mapped, not assignable |
| **ClientStack (Lawyer legacy)** | notifications, signing, profile, supportTicket | `/ClientStack/...` | N/A | **Not in catalog** | N/A | **No** |

### «תוכניות מימוש» (Implementation Plans)

There is **no** screen or i18n string **«תוכניות מימוש»** in this repo.

Closest matches:

1. **`planUsage` / `PlansPricing`** — nav label **«תוכנית ושימוש»** (`he.json` `nav.planUsage`), billing/subscription UI. Today **Platform Admin only** in `NavBarData.js` and `AdminRouteGuard.js`.
2. **Case stages / stage files** — part of **Cases** (`UpdateStage`, `/api/Files/stage-files/...`), not a separate top-level page.

**Recommendation:** Confirm with product whether «תוכניות מימוש» = `planUsage` (assignable office area) or a future screen. If = plan usage, add catalog area e.g. `planUsage` with actions `view` (and wire backend billing read APIs).

### «מסמכי ראיות»

- **UI:** `frontend/src/screens/evidenceDocuments/EvidenceDocumentsScreen.js`  
- **Route:** `EvidenceDocumentsScreenName` → `/EvidenceDocuments`  
- **Nav:** `nav.evidenceDocuments` — **only if `isPlatformAdmin`** (`NavBarData.js` L105–113)  
- **API:** `GET /api/evidence-documents/` — **`requireLawyerOrAdmin`** only (`evidenceDocumentsRoutes.js`) — **not** `requireFirmAction`  
- **Catalog:** **missing** → Platform Admin cannot hide/show via role matrix today.

---

## Current behavior vs target

| Layer | When `permissionMode === 'role'` | Gap |
|-------|----------------------------------|-----|
| Navbar | `NavBarData` filters by `canPage` / `canAction` | `evidenceDocuments`, `planUsage` hardcoded PA-only; legacy mode shows **all** links |
| Routes | `AdminRouteGuard` + `navKeyForPathname` | Missing segments: `PlanUsage`, `PlansPricing`, `EvidenceDocuments`, `PlatformSettings` |
| Backend | `attachFirmPermissions` + `requireFirmAction` in role mode | Evidence list not on catalog; legacy mode still uses `users.role` |
| Login | Admin/Staff → AdminStack; **Lawyer → ClientStack** | Lawyer + custom role **cannot** reach AdminStack pages PA enabled in matrix |

---

## Stacks / routing — minimal safe direction

**Goal:** Any page the Platform Admin enables in a role must be reachable regardless of `users.role` (Admin vs Lawyer).

**Recommended v1 (minimal):**

1. **After OTP**, call `session-scope` (or embed in login response):
   - If `permissionMode === 'role'` (or `firm_staff_role_id` set) → land on **`AdminStack`** + `firstAllowedStaffPath(pages)`.
   - Else if `users.role === Lawyer` → **ClientStack** (unchanged legacy).
   - Else Admin/Staff → AdminStack.
2. **Remove** `assertFirmStaffRoleCompatibleWithUser` (Lawyer area whitelist) — conflicts with final model.
3. **Extend catalog** with `evidenceDocuments` (+ optional `planUsage` if product confirms).
4. **NavBar:** PA-only items = `platformSettings`, `firmStaffRoles`, billing **owner** tools; move `evidenceDocuments` / assignable `planUsage` under catalog visibility.
5. **Backend:** Replace `requireLawyerOrAdmin` on evidence (and similar) with `requireFirmAreaVisible` / `requireFirmAction` for assignable areas.
6. **ClientStack:** End clients (`Customer`) unchanged; do not mount office permission catalog on client routes.

**Not in v1:** Full merge of Client lawyer UX into AdminStack (My Cases in client UI vs admin UI) — until Lawyer legacy null users migrate.

---

## Rollout — `firm_staff_role_id IS NULL`

| Phase | Behavior |
|-------|----------|
| **Now (QA)** | Null → legacy (`permissionMode: legacy`, full Admin nav, role-based API legacy rules) |
| **Before production** | PA assigns role to every non–platform-admin office user |
| **Report** | Run on each tenant DB (example):

```sql
SELECT u.userid, u.name, u.role, u.email, u.phonenumber,
       u.firm_staff_role_id,
       EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = u.userid AND pa.is_active) AS is_platform_admin
FROM users u
WHERE u.role IN ('Admin', 'Lawyer', 'Staff')
  AND u.firm_staff_role_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = u.userid AND pa.is_active = TRUE)
ORDER BY u.role, u.name;
```

| **Future** | Env flag e.g. `FIRM_ROLES_REQUIRE_ASSIGNMENT=true` → null office users denied or forced to NoPermissions (after migration) |

---

## Tests to add (QA «מזכירה מוגבלת»)

1. Create role: cases + calendar visible; clients, signing, evidence, planUsage off.
2. Assign to existing **Admin** and **Lawyer** separately.
3. **Navbar:** only allowed keys; no disabled ghosts.
4. **Direct URL** to forbidden routes → redirect to first allowed / NoPermissions; no flash.
5. **API** forbidden → 403.
6. **Live role edit** → add evidence area → refresh session-scope → nav + route + API allow; remove → block again.
7. **Lawyer** with role: must use **AdminStack** landing when role assigned (after login routing change).
8. **Null role** regression until rollout complete.

---

## Related docs

- `LAWYER_CUSTOM_ROLES.md` — **superseded** by unified role matrix (remove Lawyer area whitelist when implementing final model).
- `FIRM_STAFF_QA_PLAN.md` — assignment UX on `/AllManger`.
- `ENDPOINT_PERMISSION_MATRIX.md` — API coverage (update when evidence/plan areas added).
