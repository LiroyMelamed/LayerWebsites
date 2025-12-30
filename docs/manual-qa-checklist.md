# Manual QA checklist — overflow/RTL final gate

Smoke run order (fastest high-signal path)
1) Auth/OTP → reach the app shell
2) Dashboard (MainScreen)
3) Cases → open CaseFullView from a list
4) Signing → SigningManagerScreen → SigningScreen → UploadFileForSigningScreen
5) Notifications (NotificationsScreen)
6) Tables/Filters → stress long labels + narrow widths (Cases list + filters)
7) Popups → open/close and verify scroll/fit

Viewports to check (each item below should be verified at all three)
- Mobile narrow: ~360px width
- Tablet: ~768px width
- Desktop: ~1280px width

General pass/fail rule (for every check below)
- Pass: no unexpected horizontal scrollbar, no clipped text/buttons, no overlapped controls; RTL alignment looks intentional.
- Fail: any x-scrollbar on the page when content could wrap/shrink; truncated controls without ellipsis; dropdown/popup content clipped.

---

## Auth/OTP

1) Screen/route to open: App entry → LoginStack → LoginScreen
- Action: resize to each viewport; type a long phone number; focus/blur fields.
- Expected: inputs/buttons remain fully visible; no horizontal scrollbars.
- Pitfalls: input row not shrinking, focus ring clipped, button text overflowing, RTL alignment flip.

2) Screen/route to open: LoginStack → OtpScreen
- Action: enter OTP digits; trigger loading state (submit); rotate/resize between widths.
- Expected: OTP fields and submit controls stay within viewport; loading state does not shift layout sideways.
- Pitfalls: fixed-width OTP boxes overflow at ~360px, error text pushes layout wider, disabled states look clickable.

---

## Dashboard

1) Screen/route to open: Main dashboard → MainScreen
- Action: scan top-level cards; resize between widths.
- Expected: no page-level x-scroll; cards wrap/stack naturally.
- Pitfalls: chart + details row forces x-overflow; long Hebrew labels clip; uneven gaps between card rows.

---

## Cases

1) Screen/route to open: AdminStack/ClientStack → AllCasesScreen (cases list)
- Action: use the search input; open the dropdown results; pick a case.
- Expected: search row stays within viewport; dropdown is not clipped; selecting opens CaseFullView.
- Pitfalls: dropdown options clipped by parent, row-level clipping of focus ring, long case names overflow without ellipsis.

2) Screen/route to open: Case details popup → CaseFullView
- Action: scroll the popup content; interact with any action rows/buttons.
- Expected: popup fits viewport; internal scrolling works; actions remain reachable.
- Pitfalls: popup body creates horizontal scroll; action rows overflow at 360px; sticky/fixed footer overlaps content.

---

## Signing

1) Screen/route to open: Signing overview → SigningManagerScreen
- Action: use the search bar; switch tabs; open a signing file.
- Expected: top/search row wraps/shrinks; tab row wraps without forcing x-scroll.
- Pitfalls: tabs row forces overflow; file card header row clips filename/chip; chip alignment breaks in RTL.

2) Screen/route to open: Signing list → SigningScreen
- Action: scan file cards; focus/hover action rows; resize to 360px.
- Expected: file name ellipsizes; actions row wraps; no horizontal scroll.
- Pitfalls: action buttons overflow as a single row; progress bars overflow their container; chips overlap text.

3) Screen/route to open: Upload flow → UploadFileForSigningScreen
- Action: open upload modal/popup; inspect the two-column area; resize to 360px and 768px.
- Expected: modal content stays within viewport; columns stack on narrow widths; PDF container scrolls internally.
- Pitfalls: grid columns don’t shrink (content overflows), modal body clips content, close button becomes unreachable.

---

## Notifications

1) Screen/route to open: ClientStack → NotificationsScreen
- Action: scroll list; open any notification details if available; resize widths.
- Expected: list items wrap/ellipsis cleanly; no x-scroll.
- Pitfalls: long notification text forces overflow; timestamp alignment breaks in RTL; empty/error states overflow.

---

## Tables/Filters

1) Screen/route to open: AllCasesScreen filter row (type/status)
- Action: set filters; try long labels (if present); resize to 360px.
- Expected: filter controls wrap to next line; button labels ellipsize instead of pushing width.
- Pitfalls: filter row clips (previously from overflow hidden), buttons refuse to shrink (min-width issue), icons squeeze text off-screen.

2) Screen/route to open: Any SimpleTable usage (wherever a table appears in the app)
- Action: scroll horizontally inside the table area at 360px.
- Expected: table scrolls horizontally within its container (intentional), without forcing whole-page x-scroll.
- Pitfalls: page gets global x-scroll; header row misaligns with body; cell text clipped without ellipsis.

---

## Popups

1) Screen/route to open: Any popup opened from MainScreen or cases (e.g., CaseFullView)
- Action: open popup, then resize to 360px while it’s open; scroll content.
- Expected: popup stays inside viewport; content scrolls vertically; no x-scroll.
- Pitfalls: popup width exceeds viewport; scroll gets trapped; close action off-screen.

---

## RTL/Overflow

1) Screen/route to open: Run through MainScreen → AllCasesScreen → CaseFullView → Signing screens
- Action: at each screen, visually confirm RTL alignment on rows (icons/text order, edge alignment) while resizing.
- Expected: logical spacing holds (start/end), and rows wrap without reversing meaning.
- Pitfalls: margins applied on the wrong side, icons on the wrong edge, ellipsis truncation on the wrong side, focus outline clipped.
