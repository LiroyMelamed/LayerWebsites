# Audit Report

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
- Doughnut chart analytics: made `DoughnutChartWithDetails` wrap-safe (legend chips wrap, no overlap) and constrained the chart center text overlay for small screens.

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

- Made viewer header/actions rows wrap and enforced a `2.75rem` minimum touch target for buttons in the actions row.

Remaining:
- Verify the PDF viewer itself stays within the viewport at 360px (viewer/overlay layout is mostly inside the PdfViewer component).

#### SigningScreen (Client)
Findings:
- Tabs row could overflow at ~360px due to wide button labels + no wrap.
- Actions row could overflow when “sign/download” + “details” buttons sit side-by-side.
- Long notes/case names could cause awkward wrapping or x-overflow in detail rows.

- Made the top row wrap and ensured the search control can shrink (`min-inline-size: 0`).
- Styled the footer action button via a safe structural selector (`.lw-allMangerScreen__footer > .lw-textButtonWithTwoOptionalIcons`) and enforced a `2.75rem` min touch target.
- Replaced fragment list rows with a keyed structural wrapper per admin and added shrink-safety on wrappers.
- Migrated AdminMenuItem row layout to the shared `row()` mixin and allowed wrapping on small screens (email remains hidden on mobile).
- Made AdminPopup input rows/actions wrap, removed fixed min widths that can force overflow, and enforced `2.75rem` on rendered action buttons.

Remaining:
- Quick visual check on 360px: confirm SearchInput result dropdown doesn’t clip and popup actions remain visible without awkward horizontal scroll.

