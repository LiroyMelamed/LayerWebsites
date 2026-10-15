---
name: "LayerWebsites Calendar"
description: "The existing legal platform's navy scheduling surfaces, documented from the implemented calendar."
colors:
  primary: "#2A4365"
  primary-highlighted: "#1A365D"
  sidebar-selected: "#4C6690"
  white: "#FFFFFF"
  secondary-highlighted: "#EDF2F7"
  disabled: "#E2E8F0"
  text: "#2D3748"
  winter: "#718096"
  field-border: "#CBD5E0"
  accepted-bg: "#F0FFF4"
  accepted-text: "#276749"
  warning-bg: "#FFFAF0"
  warning-text: "#744210"
  declined-bg: "#FFF5F5"
  dark-red: "#9B2C2C"
typography:
  headline:
    fontFamily: "Heebo, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Arial, sans-serif"
    fontSize: "24px"
  title:
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontSize: "14px"
    lineHeight: 1.5
  detail:
    fontSize: "13px"
    lineHeight: 1.5
  label:
    fontSize: "12px"
    lineHeight: 1.5
rounded:
  badge: "4px"
  inset-option: "6px"
  surface: "8px"
  input: "12px"
  shared-card: "16px"
  pill: "999rem"
  avatar: "50%"
spacing:
  space-1: "0.25rem"
  space-2: "0.5rem"
  space-3: "0.75rem"
  space-4: "1rem"
  space-6: "1.5rem"
  space-8: "2rem"
components:
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.primary-highlighted}"
    rounded: "{rounded.surface}"
    padding: "0.4rem 0.5rem"
  button-secondary-pressed:
    backgroundColor: "{colors.secondary-highlighted}"
    textColor: "{colors.primary-highlighted}"
  button-icon:
    textColor: "{colors.primary}"
    rounded: "{rounded.surface}"
    height: "2.75rem"
    width: "2.75rem"
  manager-filter:
    backgroundColor: "{colors.white}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
    padding: "0.375rem 0.75rem"
  manager-filter-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.white}"
  meeting:
    backgroundColor: "{colors.white}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
    padding: "16px"
  status-accepted:
    backgroundColor: "{colors.accepted-bg}"
    textColor: "{colors.accepted-text}"
    rounded: "{rounded.badge}"
    padding: "3px 6px"
---

# Design System: LayerWebsites Calendar

## Overview

**Creative North Star: "The Legal Office Daybook"**

This is a scoped record of the implemented calendar, including its compact home widget. It inherits the platform's navy palette, Heebo typography, shared controls and tenant identity. The name describes the existing operational character; it introduces no replacement brand.

The day surface uses an airy time rail and appointment cards. Week and month preserve planning density while keeping a path to the selected day's details. Owner portraits or initials tie appointments to the responsible team members. This record describes source behavior, cross-checked against the final desktop-day, mobile-week and mobile-month captures under `outputs/calendar-release-20261012/browser-final-v3` in the parent workspace. The capture set also includes desktop-week, desktop-month and mobile-day; this document does not certify browser, Figma or native approval. Figma and native verification remain pending normal Mac unlock.

**Key Characteristics:**
- Familiar navy selection on white and cool gray surfaces.
- Readable daily cards with compact planning alternatives.
- Owner portraits or initials, translated labels and directional layout.
- Shared platform buttons, fields, segmented navigation and popups.

Source authority: `CalendarScreen.js` and `CalendarScreen.scss`; `components/CalendarAgenda.js` and `.scss`; `components/CalendarOwners.js` and `.scss`; `components/EventFormModal.js` and `.scss`; `components/PersonalSyncModal.js` and `.scss`; `../mainScreen/components/CalendarWidget.js` and `.scss`. Shared authority is `../../styles/theme.scss`, `../../styles/_variables.scss`, `../../components/simpleComponents/`, and `../../components/styledComponents/SegmentedSwitch.scss`. `../../index.scss` loads the owner-avatar stylesheet once before the screen styles. The root `PRODUCT.md` supplies the binding platform identity, workflow preservation and multilingual constraints; this document supplies only calendar visual guidance.

## Colors

Muted navy identifies actions and selections; white and cool gray organize the working surface. Frontmatter contains the recorded values; theme custom properties remain the implementation authority.

### Primary
- **Office Navy** (`primary`): selected dates, active filters, period titles, timeline markers and keyboard outlines.
- **Deep Navy** (`primary-highlighted`): shared outlined-button content and focused shared fields.
- **Slate Navy** (`sidebar-selected`): incumbent FullCalendar toolbar controls and secondary labels.

### Secondary
- **Response Green** (`accepted-bg`, `accepted-text`): accepted-response labels.
- **Response Amber** (`warning-bg`, `warning-text`): partial-response labels.
- **Response Red** (`declined-bg`, `dark-red`): declined, cancelled and conflict notices.

### Neutral
- **White** (`white`): cards, inputs and unselected controls.
- **Cool Gray** (`secondary-highlighted`): segmented tracks, hover wash and subdued labels.
- **Divider Gray** (`disabled`): card borders, timeline rails and section separators.
- **Ink** (`text`): appointment titles and ordinary content.
- **Winter Slate** (`winter`): times, client details and supporting metadata.
- **Field Gray** (`field-border`): calendar-specific fields and unselected chips.

**The Selection Continuity Rule.** Selected controls use navy with white content across owner filters, the day ribbon and mobile month selection.

Event and owner colors come from the existing event data and `colorForKey`; they are contextual identifiers, not additional brand accents. Leave stripes distinguish an existing leave category. Neither status colors nor patterns replace translated labels.

## Typography

**Display and Body Font:** Heebo with the platform's system and sans-serif fallbacks. There is no separate calendar display face.

**Character:** A practical text ramp with modest size changes and weight doing much of the hierarchy work. Dense planning cells reduce type; the agenda restores readable titles and metadata.

### Hierarchy
- **Headline:** shared Text24 for screen and personal-sync titles.
- **Period title:** desktop date heading (20px, 600, line-height 1.5), reduced to the title role on phones.
- **Title:** agenda headings and daily appointment titles use the frontmatter title role; daily appointment titles become 15px on phones.
- **Body:** shared Text14 and owner-filter labels use the body scale.
- **Detail:** owner names, client names and time-group labels use the detail scale. Compact week titles use 13px at weight 500.
- **Label:** metadata and supporting labels use the label scale. Status badges and compact participant details reduce to 11px.

**The Detail Recovery Rule.** Compact representations keep a route to the day's agenda or event modal, where the full event title is available. The event modal's full-title block wraps anywhere and is not line-clamped.

Daily titles clamp to three lines and participant text to two; compact week titles clamp to two. Grid titles use two lines or month ellipsis. These are recorded density behaviors, not permission to discard calendar text or data.

## Layout

The calendar is one flexible column by default. Opening filters adds a sidebar (17.5rem) above the main column only from 1280px upward; below that it stacks. Desktop page padding is 1.5rem vertically and 2rem horizontally with 6rem bottom clearance. Below 768px, the page uses 1rem padding, retains the bottom clearance and reduces the calendar card padding from 1rem to 0.75rem.

Scope and view controls wrap; search occupies a full control row alongside the filter action. On phones they stack and stretch. Owner filters remain an independently horizontally scrollable strip. Search reserves 2.75rem at the inline end for its icon and restricts its floating label to avoid collision.

The seven-day ribbon is seven equal columns, with a maximum width of 760px and day targets at least 72px tall. Daily time groups pair a 60px rail with a flexible event column and a 12px gap; on phones the rail is 48px with an 8px gap. Parallel events stay stacked within the same time group.

Week overview uses day containers with two compact event previews and an action to open remaining events. Compact meetings are unboxed rows inside the day container. Desktop time layouts use the existing FullCalendar grid. Phone month cells show date and event count rather than miniature event rows; selecting a cell exposes that day's agenda below. The selected phone date uses a navy rounded rectangle with white content, not a circular date badge.

The home widget splits today and tomorrow with a separator on wider screens; at 48rem and below, the buckets stack and the separator disappears. Its event rows keep time, owner identity and wrapping content within a full-width click target.

Event-form selectors use three, four or five equal columns on desktop. Four- and five-choice groups become two columns below 32.5rem; the five-choice group also becomes two columns below 40rem. Form action buttons stack below 40rem. The event form caps width at 40rem; personal sync caps at 32.5rem and uses its own scrolling content.

Use logical inline/block properties and inherited direction. Time strings use bidirectional isolation; time-grid labels and home-widget times use tabular figures. The floating add action reserves bottom content clearance and uses safe-area positioning. Source contains separate WebView/footer-managed positioning branches; this does not establish native-device approval.

## Elevation & Depth

Depth is restrained but present. Daily meeting cards use a small ambient shadow; the shared main card and outlined buttons retain the platform's shadows. The calendar overrides shared-card hover translation so the planning surface stays still. Compact week rows remove borders and shadows. Borders and pale backgrounds do most grouping work.

### Shadow Vocabulary
- **Daily meeting:** `0 2px 4px rgb(0 0 0 / 6%)`.
- **Shared card:** `0 0.25rem 0.375rem -0.0625rem rgba(0, 0, 0, 0.1), 0 0.125rem 0.25rem -0.0625rem rgba(0, 0, 0, 0.06)`.
- **Shared button:** `0 0.125rem 0.25rem rgba(0,0,0,0.1)`.

**The Stable Planning Surface Rule.** Calendar and filter containers stay fixed on hover; compact meeting rows carry no independent elevation.

Inherited FullCalendar RSVP selectors contain colored glow treatments. They are recorded as existing implementation baggage, not the reusable elevation vocabulary.

## Shapes

Soft rectangles dominate: calendar surfaces and meeting cards use the surface radius; status labels use the smaller badge radius. Shared inputs retain their input radius, and the home widget retains its shared-card shell. Scope/view navigation uses the incumbent pill silhouette; manager filters and event-form selectors use rectangles. Owner photos and initials are circular. The floating add action is also circular.

These are component-specific shapes. No blanket ban on pills, circles or leave stripes belongs to this system.

## Components

### Buttons

Shared outlined secondary buttons remain the platform action primitive. Their small variant uses the recorded padding, navy outline and white fill, with a cool-gray pressed fill and slight pressed scale. Date arrows and refresh controls use transparent icon buttons with a cool-gray hover wash. Calendar tool buttons, arrows, owner filters, scope/view options and meeting targets establish 44px minimum interaction dimensions where their scoped styles apply. Do not infer that every inherited popup or ancillary control meets that target from this document.

Keyboard focus uses navy outlines (2px) with an offset (2px, or 3px on daily meeting cards). Disabled shared controls preserve their existing disabled treatments.

### Chips

Owner filters combine avatar and name in a rounded rectangle; active filters invert to navy/white. Active-filter removal controls use the incumbent pale-blue styling. Reminder-channel chips and personal-sync chips use white backgrounds, field-gray borders and pill shapes, becoming navy/white when selected. RSVP labels use subdued status backgrounds with readable text. Event type, recurrence, cancellation and conflicts remain separate translated meanings.

### Cards / Containers

Daily meetings combine an owner group, title, owner/client text, metadata, status labels and an opening chevron. The whole actionable meeting is a button. Cancellation strikes the title; conflict text remains visible below. Week day containers have a navy selected border and unboxed compact rows. The home widget uses bordered white event rows with a subtle hover wash. Empty, loading and error states retain their existing translated content and retry paths.

### Inputs / Fields

Use existing SimpleInput and platform selector components. Shared fields inherit direction and keep floating labels. The search field reserves space for its inline-end Lucide icon. Calendar-specific select/input fields use white fills and field-gray strokes, changing to navy with a small focus ring. The event modal keeps visible field labels and a separately wrapping full-title block for long event names.

### Navigation

Use the existing platform shell. Calendar scope and day/week/month choices use shared SegmentedSwitch tracks, equal flexible options and navy active fills. Phone controls wrap or stretch rather than shrinking their text. Date arrows reverse according to the existing language logic; labels remain translated.

### Owner Identity and Planning Events

CalendarOwners renders all resolved owners as photo or initials with accessible names. Standard avatars are 36px; small avatars are 26px. Grid event overrides use 14px avatars and hide the avatar group below a 56px event-container width. That is a compact-grid limitation, not a system rule to hide owner information on future surfaces. Agenda rows also retain owner names.

Grid response and conflict indicators use Lucide SVGs with translated accessible labels. Accepted, declined and pending use check, X and clock symbols; partial response displays counts. Month grid status is omitted from the miniature row; the selected agenda supplies its detail path.

The event-form body transition is a short opacity/vertical entrance (320ms, `cubic-bezier(0.22, 1, 0.36, 1)`). Its reduced-motion query removes this animation. The redesigned calendar's reduced-motion rule removes transitions and animations within its scope. Preserve that accommodation when adding movement.

## Do's and Don'ts

### Do:
- **Do** inherit the platform's navy, Heebo, shared components and tenant identity.
- **Do** preserve calendar logic, permissions, translated text and existing editing/sync workflows.
- **Do** retain owner identity and provide a detailed path from compact planning representations.
- **Do** keep keyboard focus, directional layout and reduced-motion behavior visible in new calendar surfaces.
- **Do** use unboxed compact rows inside week day containers and rounded navy selected dates on phones.

### Don't:
- **Don't** turn this calendar record into a replacement platform identity or a root-level design policy.
- **Don't** promote compact-grid clipping, tiny labels or avatar suppression into general rules for detail views.
- **Don't** replace shared navigation and form primitives with unrelated visual components.
- **Don't** use status color as the only available description of response, cancellation or conflict.
- **Don't** claim browser, Figma or native validation from this design record.
