# Audit Report

## Phase B — E2E Functionality (API-first)

### Scope
Phase B focuses on validating real end-to-end CRUD behavior against the running local stack (backend + Postgres) using real HTTP calls and real auth (JWT via OTP). The primary scope here is:

- Cases: list/read/create/update/delete + tagging + permissions
- Case Types: list/search/create/update/delete + permissions
- Admins: list/search/create/update/delete + permissions

UI-level verification is tracked in [docs/e2e-checklist.md](docs/e2e-checklist.md), but Phase B evidence below is **API-first** to isolate backend correctness.

### Environment
- Backend: `http://localhost:5000`
- Frontend: `http://localhost:3000`
- DB: Postgres via `backend/config/db.js`
- Auth used for testing: OTP login using local `scripts/e2e/.env` (not committed)

Canonical harness runPrefix: `e2e-20251230-0045-`

### Results summary
- Harness overall: ✅ PASS (25/25 checks)
- Dashboard API: ✅ PASS (admin returns expected keys; non-admin denied)
- Cases WhatsApp link flow: ✅ PASS (read/update/clear; invalid URL rejected)
- Notifications: ✅ PASS (list + mark read idempotent; unread count non-increasing)
- Signing: ✅ PASS (reachability only; full upload/detect/sign flow still TODO)

### Evidence
Canonical evidence is recorded in [docs/e2e-checklist.md](docs/e2e-checklist.md) under **0.1 Automated evidence harness (API-first)**.

Evidence folder: `scripts/e2e/out/e2e-20251230-0045-/`
- `summary.json`
- `dashboard.json`
- `cases.whatsapp.json`
- `notifications.json`
- `signing.json`
- `auth.json`

### Fixes applied during Phase B

#### 1) CaseTypes get-by-id bug
- Symptom: `GET /api/CaseTypes/GetCaseType/:caseTypeId` returned 404 for existing IDs.
- Root cause: controller read `req.params.CaseTypeId` while the route param is `:caseTypeId`.
- Fix: accept `caseTypeId` (and tolerate `CaseTypeId`), validate numeric, query with parsed int.

#### 2) Critical authorization gap: non-admin could call admin management APIs
- Symptom: a non-admin JWT could call `GET /api/Admins/GetAdmins` and receive data.
- Root cause: admin routes required authentication but did not enforce role.
- Fix: added `requireAdmin` middleware and applied to all admin-management endpoints.

#### 3) Case data leakage risk: non-admin could fetch arbitrary cases by ID
- Symptom: `GET /api/Cases/GetCase/:caseId` allowed access to any case ID.
- Root cause: controller query did not scope by `userid` for non-admin.
- Fix: for non-admin users, query adds `AND C.userid = $2` (owner-only access). Admin behavior unchanged.

#### 4) Stability: prevent SMS integration issues from failing CRUD
- Symptom: missing/invalid SMS provider configuration could break CRUD flows.
- Fix: wrapped SMS send calls in try/catch (case creation/update/stage update and customer welcome).

#### 5) Notifications: mark-as-read robustness
- Symptom: E2E harness attempted `PUT /api/Notifications/undefined/read` and received 500.
- Root cause: list endpoint returns Postgres column names as lowercase (`notificationid`, `isread`, `createdat`), while the harness was reading `NotificationId` and constructed an invalid URL.
- Fix:
  - Harness: normalize notification fields before selecting a target.
  - Backend: validate `:id` is a number and return 400 for invalid IDs (prevents 500).

### Open items (not completed in Phase B)
- Add minimal automated API tests (e.g., supertest) for one happy path per resource + one permission test.
- Validate UI flows end-to-end (screens, state refresh, error surfaces) beyond API-first checks.
- Continue remaining checklist areas: dashboard data, notifications, signing flow.

---

## Phase C plan — Styling architecture + rem migration

### Current styling architecture (frontend)
- Global reset/base styles were in `frontend/src/index.css`.
- Theme tokens are provided as CSS custom properties in `frontend/src/styles/theme.scss` (e.g. `--lw-color-*`, `--lw-font-stack`).
- Most screen/component styling already uses per-feature `.scss` files co-located with components (e.g. `frontend/src/screens/**`, `frontend/src/components/**`).
- No CSS Modules were found (no `*.module.css` / `*.module.scss`).

### Phase C approach (execution rules)
- Introduce shared SCSS foundation under `frontend/src/styles/`:
  - `_variables.scss` (spacing scale, typography, layout constants)
  - `_mixins.scss` (rem helper + RTL/media helpers)
  - `_globals.scss` (reset/base)
- Convert `index.css` → `index.scss` and wire global imports via `frontend/src/index.js`.
- Rem strategy: set `html { font-size: 16px; }` so `1rem = 16px`, then migrate typography + spacing from `px` → `rem`.
  - Borders may remain `px`.
  - Prefer logical properties when touching direction-sensitive spacing (e.g. `margin-inline-start` instead of `margin-left`).
- Migrate incrementally by folder/screen group with small commits; after each scoped commit, run `npm --prefix frontend run build`.

---

## Phase D — Inline layout styles sweep

### Phase D complete
- Verified `git grep "style={{" frontend/src` returns no matches (all JSX style literals removed).
- Static layout/spacing/typography that previously lived in inline styles was moved into co-located SCSS (rem-based + logical properties where applicable).
- Inline styling that still exists is limited to truly runtime-dynamic values passed via `style={someObject}` (not JSX literals), mainly:
  - Dynamic sizing/positioning in signing/PDF flows (e.g. spot bounding boxes, rendered PDF width) where values depend on measurements/scale.
  - Dynamic “token” values expressed as CSS variables (e.g. status chip colors, input focus styles) that are data-driven at runtime.

---

## Phase F — Row layout standardization ("gaps" sweep)

### Phase F complete
Phase F standardizes app-wide “row-like” wrappers to a single, RTL-safe, wrap-friendly flex-row convention to eliminate awkward whitespace and alignment issues (especially in search/filter rows).

### What was standardized
- Shared foundation:
  - `frontend/src/styles/_mixins.scss`: `@mixin row(...)` (gap-based, wrap-friendly, `min-inline-size: 0`, RTL-safe via logical sizing)
  - `frontend/src/styles/_globals.scss`: `.lw-row`, `.lw-row__grow`, `.lw-row__control` utilities
- Row wrapper patterns:
  - `__row`, `__topRow`, `__headerRow`, `__actionsRow`, and other “row wrappers” migrated to `@include row(...)`
  - Removed all occurrences of `justify-content: space-between` used as a spacing hack; replaced with `gap` + explicit flex rules (including `margin-inline-start: auto` where “push-to-edge” alignment was intended)

### Components restyled (behavior unchanged)
- `frontend/src/components/specializedComponents/containers/ProgressBar.scss`
- `frontend/src/components/specializedComponents/charts/DoughnutChartWithDetails.scss`

### Intentionally custom (kept custom) and why
- Collapse/expand containers that rely on `max-height` transitions and `overflow: hidden` for animation (kept to preserve behavior and avoid layout jank).
- Signing/PDF viewer and modal layouts that use grid/absolute positioning for interactive overlays (kept because geometry/interaction is not a simple “row gap” problem).

### Overflow audit (mandatory)
Checked (systematically):
- Horizontal overflow risks: long Hebrew text, long case names, multiple buttons in rows, narrow widths
- Vertical overflow risks: modal/popup content scrolling and actions visibility
- Component-level overflow: tables and “chip/button” layouts

Fixes applied:
- `frontend/src/components/simpleComponents/SimpleTable.scss`: made tables intentionally horizontally scrollable (`overflow-x: auto`) instead of clipping content.
- Filter/search rows: removed row-level `overflow: hidden` clipping and ensured buttons can shrink safely without forcing x-overflow.
- Signing modal: made the two-column grid overflow-safe (`minmax(0, fr)` columns) and stack to a single column on narrow screens.

Done:
- Removed the main “x-clipping” hacks in filter/search rows.
- Ensured long button labels don’t force horizontal overflow.
- Prevented signing modal grid from overflowing at narrow widths.

Remaining:
- Quick manual pass on narrow widths (mobile + small desktop) to confirm no horizontal scrollbars/clipping on the listed screens.

### Quick manual smoke checklist
Open these screens and visually confirm (RTL alignment, no awkward gaps, no unexpected x-scroll; popups stay on-screen):
- Main dashboard: `MainScreen`
- Case details: `CaseFullView`
- Signing flow: `SigningScreen`, `SigningManagerScreen`, `UploadFileForSigningScreen`
- Notifications: `NotificationsScreen`

---

## Phase 1 — Responsive + RTL + layout audit (batch, 2025-12-30)

### Goals (per requirements)
- Consistent breakpoints (target: `48rem` / ~768px) and RTL-safe layout conventions.
- Prefer SCSS (rem + logical properties) and minimize runtime inline layout styles.
- Establish a repeatable pattern for hiding non-critical table columns on small screens.

### Utilities added/extended
- `frontend/src/styles/_variables.scss`
  - Added breakpoint tokens: `$bp-narrow`, `$bp-md`, `$bp-lg`.
- `frontend/src/styles/_mixins.scss`
  - Added `@mixin fluid-size($property, $minPx, $preferred, $maxPx)` to standardize `clamp(rem(), ..., rem())` sizing.
- `frontend/src/styles/_globals.scss`
  - Added `.lw-hideOnMobile` utility (hides at `max-width: $bp-md`).
  - Switched the existing narrow breakpoint query to `$bp-narrow`.

Also:
- Normalized signing-related media queries to the shared `$bp-md` token (replacing literal `48rem`).

### Responsive logo sizing (RTL-safe)
- Small screen top toolbar logo: moved sizing into SCSS (fluid clamp) and removed inline width/height props.
- Sidebar logo (TopAndRightNavBar): moved sizing into SCSS and made it fluid.
- Login + OTP top-corner logos: replaced fixed `3.5rem` size with fluid clamp.

Files touched:
- `frontend/src/components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen.scss`
- `frontend/src/components/navBars/TopAndRightNavBar.scss`
- `frontend/src/screens/loginScreen/components/TopCenteredLogo.scss`
- `frontend/src/screens/otpScreen/components/TopCenteredLogoOtp.scss`

### Mobile table column hiding (consistent rule)
- Customers: hide Email on small screens (header + rows).
- Admins/Managers: hide Email on small screens (header + rows).

Pattern:
- Add a dedicated `--email` classname on the header cell and the data cell and hide them with a `max-width: $bp-md` media query.

### Remaining (not done yet)
- Systematically scan all remaining screens/components for anonymous layout elements, physical left/right props, and overflow at 360/768/1280.
- Apply the hide-on-mobile pattern to any other dense lists/tables where Email/secondary columns are optional.
- Continue replacing any remaining fixed pixel sizes or one-off breakpoints with shared tokens where safe.

### Screens audited (Phase 1)

#### AllCasesScreen / AllCasesCard (Cases list)
Findings:
- Long case titles could force horizontal overflow without a hard truncation path.
- List rendering used an unkeyed fragment wrapper, making future layout work brittle.
- CaseMenuItem spacing relied on a margin-based hack and had no explicit touch-target minimum.
- Hover dropdown positioning used physical `left`, which is not RTL-logical.

Fixes:
- Added a keyed structural wrapper per list row to remove anonymous fragments and keep separator + item aligned.
- Made the case title overflow-safe (`ellipsis` + min-inline-size: 0) and shifted CaseMenuItem spacing to tokenized `gap`/`row()` mixin usage.
- Added `min-block-size: 2.75rem` and padding to CaseMenuItem header for touch friendliness.
- Made HoverContainer use logical `inset-inline-start` with direction-aware positioning.

Remaining:
- Audit CaseFullView (popup) for long-field truncation and 360px overflow.

#### CaseFullView (Case details popup)
Findings:
- Two-column rows could get too cramped at ~360px widths; needed clearer wrapping behavior.

Fixes:
- Set field flex-basis/min-inline-size so rows wrap to 1-column on narrow widths.
- Made the container/rows/textareas explicitly overflow-safe (`min-inline-size: 0`, full-width textarea rows).

Remaining:
- Consider adding explicit padding/gutters inside the popup scroll content if the popup frame feels tight on mobile (defer unless requested).

#### NotificationsScreen (Client)
Findings:
- Long titles/messages could produce very tall cards or awkward wrapping on small screens.
- Mark-as-read button was small on mobile (touch target risk).
- Spacing mixed literal rem values and token values; some margin-based spacing duplicated `gap` spacing.

Fixes:
- Clamped title (1 line) and message (3 lines) to stabilize layout.
- Increased mark-as-read button size on small screens and enforced a minimum block size.
- Converted key paddings/margins to `m.rem(...)`/spacing tokens and removed redundant margin where `gap` already applies.

Remaining:
- If we see truncated content complaints, consider a “tap to expand” pattern later (out of Phase 1 scope unless requested).

#### SigningManagerScreen (Admin)
Findings:
- Search + “upload new signing file” row could force horizontal overflow at ~360px due to no wrapping.
- Action buttons row could overflow when two buttons are rendered side-by-side.
- Long file names and long detail strings (e.g., rejection reason) could push layout wider than the viewport.

Fixes:
- Made the top row and actions row wrap on narrow widths.
- Added truncation for long file names and ensured all card/header flex children can shrink (`min-inline-size: 0`).
- Allowed long detail strings to wrap safely (`overflow-wrap: anywhere`).

Remaining:
- Quick visual check on 360px: confirm the upload button wraps under the search input and all actions remain easy to tap.

#### UploadFileForSigningScreen (Admin)
Findings:
- Selected signer “chips” (buttons) could overflow horizontally when multiple signers are selected.
- Long selected file names could push the green “file selected” row wider than the viewport.
- The viewer header row and bottom action buttons could overflow on narrow screens when laid out as a single row.

Fixes:
- Made selected signers row wrap and ensured it can shrink (`min-inline-size: 0`).
- Truncated the selected file name row (`ellipsis`) to prevent horizontal overflow.
- Made viewer header/actions rows wrap and enforced a `2.75rem` minimum touch target for buttons in the actions row.

Remaining:
- Verify the PDF viewer itself stays within the viewport at 360px (viewer/overlay layout is mostly inside the PdfViewer component).

#### SigningScreen (Client)
Findings:
- Tabs row could overflow at ~360px due to wide button labels + no wrap.
- Actions row could overflow when “sign/download” + “details” buttons sit side-by-side.
- Long notes/case names could cause awkward wrapping or x-overflow in detail rows.

Fixes:
- Made tabs and actions rows wrap on narrow widths and reduced tab-row gap at the narrow breakpoint.
- Enforced `2.75rem` minimum touch target and flex-basis rules for actions buttons to prevent horizontal overflow.
- Made detail rows wrap safely (`overflow-wrap: anywhere`) and ensured cards/headers are shrink-safe (`min-inline-size: 0`).

Remaining:
- Quick 360px sweep: confirm tabs/actions collapse to a single column cleanly and SignatureCanvas modal overlays do not clip.

#### ClientsCard + ClientPopUp (Admin)
Findings:
- Client rows used a fixed flex row without the shared `row()` mixin; long tokens could force horizontal overflow.
- Client popup form (2 inputs per row) could get cramped at ~360px; actions could overflow when both buttons are shown.
- The “Add client” button styling relied on a `className` prop that isn’t applied by the current button component stack.

Fixes:
- Migrated client row layout to `row()` + `min-inline-size: 0` and allowed long tokens to wrap (`overflow-wrap: anywhere`).
- Made popup input rows and actions wrap cleanly on narrow widths; enforced `2.75rem` minimum touch targets for action buttons.
- Styled the “Add client” button via a safe structural selector (`.lw-clientsCard > .lw-textButtonWithTwoOptionalIcons`) so layout rules apply reliably.

Remaining:
- If we decide to rely on button `className` props app-wide, consider updating `TextButtonWithTwoOptionalIcons` to merge incoming `className` (separate, higher-risk change).

#### TaggedCasesScreen (Admin)
Findings:
- Search + filters row (two `ChooseButton`s) could overflow at ~360px due to fixed min widths and no guaranteed wrapping.
- Pinned cases list used an anonymous fragment wrapper and a non-strict inequality check (`!=`).
- Footer “נעיצת תיק” and TagCasePopup “נעץ” button styling relied on `className` props that are not forwarded by the current button component stack.

Fixes:
- Made screen rows wrap and ensured search/choose controls are shrink-safe (`min-inline-size: 0`).
- Replaced fragment list rows with a keyed structural wrapper and switched to strict inequality (`!==`).
- Enforced `2.75rem` minimum touch target for the footer/popup actions by styling the rendered `.lw-textButtonWithTwoOptionalIcons` element.

Remaining:
- If we want per-button `className` styling to work reliably, consider a global fix to forward/merge `className` in the button stack (separate change).

#### AllCasesTypeScreen (Admin)
Findings:
- Search + stage-count filter row could overflow at ~360px due to fixed min widths and no wrapping.
- Footer “הוספת סוג תיק” button styling relied on a `className` prop that isn’t forwarded by the current button stack.
- Case types list card used fragment wrappers (anonymous layout) which makes separator + item alignment brittle.

Fixes:
- Made the top row wrap and made search/filter shrink-safe (`min-inline-size: 0`).
- Styled the footer action button via a safe structural selector (`.lw-allCasesTypeScreen__footer > .lw-textButtonWithTwoOptionalIcons`) and enforced `2.75rem` min touch target.
- Replaced fragment list rows with a keyed structural wrapper per item.

Remaining:
- Consider a global `className` forwarding fix in the button stack if we want to reliably style individual buttons (separate change).

#### AllMangerScreen (Admin)
Findings:
- Search row could overflow at ~360px due to no guaranteed wrapping/shrink-safety.
- Footer “הוסף מנהל” button styling relied on a `className` prop that isn’t forwarded by the current button stack.
- Admin list used fragment wrappers (anonymous layout), and row layout wasn’t fully standardized to the shared `row()` mixin.
- AdminPopup form rows/actions could overflow on narrow widths; action buttons needed a reliable touch target minimum.

Fixes:
- Made the top row wrap and ensured the search control can shrink (`min-inline-size: 0`).
- Styled the footer action button via a safe structural selector (`.lw-allMangerScreen__footer > .lw-textButtonWithTwoOptionalIcons`) and enforced a `2.75rem` min touch target.
- Replaced fragment list rows with a keyed structural wrapper per admin and added shrink-safety on wrappers.
- Migrated AdminMenuItem row layout to the shared `row()` mixin and allowed wrapping on small screens (email remains hidden on mobile).
- Made AdminPopup input rows/actions wrap, removed fixed min widths that can force overflow, and enforced `2.75rem` on rendered action buttons.

Remaining:
- Quick visual check on 360px: confirm SearchInput result dropdown doesn’t clip and popup actions remain visible without awkward horizontal scroll.

