---
name: Legal platform — client portal
description: Actions, authorized documents and personal signing history in the existing legal-platform visual system.
colors:
  primary: "#2A4365"
  primary-highlighted: "#1A365D"
  sidebar-selected: "#4C6690"
  surface: "#FFFFFF"
  surface-muted: "#EDF2F7"
  divider: "#E2E8F0"
  text: "#2D3748"
  text-secondary: "#4A5568"
  home-muted: "#526579"
  disabled-content: "#A0AEC0"
typography:
  home-heading:
    fontFamily: "Heebo, system-ui, sans-serif"
    fontSize: "clamp(1.625rem, 2.4vw, 2rem)"
    fontWeight: 700
    lineHeight: 1.4
  section-heading:
    fontFamily: "Heebo, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Heebo, system-ui, sans-serif"
    fontSize: "1rem"
    lineHeight: 1.5
  metadata:
    fontFamily: "Heebo, system-ui, sans-serif"
    fontSize: "0.875rem"
  button-label:
    fontFamily: "Heebo, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
rounded:
  button: "0.5rem"
  input: "0.75rem"
  surface: "1rem"
  segment: "999rem"
spacing:
  small: "0.5rem"
  control-gap: "0.75rem"
  standard: "1rem"
  section: "1.5rem"
  spacious: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.button}"
    padding: "0.8rem 1rem"
    typography: "{typography.button-label}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary-highlighted}"
    rounded: "{rounded.button}"
    padding: "0.8rem 1rem"
    typography: "{typography.button-label}"
  button-tertiary:
    backgroundColor: "transparent"
    textColor: "{colors.primary-highlighted}"
    rounded: "{rounded.button}"
    typography: "{typography.button-label}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
    padding: "1.5rem"
  input-search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.input}"
  segment-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.segment}"
---

# Design System: Legal platform — client portal

## Overview

**Creative North Star: "The existing legal-platform workspace"**

This feature extends the incumbent Heebo, navy and white interface. It uses its existing buttons, segmented switch, inputs, popup, navigation and case cards. The approved direction is to make available work understandable without replacing the office's familiar visual identity.

This document is scoped to the built client portal, not a replacement for the entire application's design system. It describes the local build on base `237d31ad1b402d26857b85d77a9a1407bb9192c4`; it does not assert production deployment or installed-device verification. The source of authority is [DIRECTION.md](DIRECTION.md), the actual frontend and the final `02` source/visual captures. A subsequent scoped document-popup LTR correction is recorded from source; its build04 English browser verification is pending and is not claimed by this record. The earlier concept PRODUCT.md supplies the incumbent brand commitment; its pre-implementation API limitations do not describe the current build.

**Key Characteristics:**
- Familiar navy actions, white surfaces and fine separators.
- Readable hierarchy with actions, metadata and status visibly distinguished.
- Responsive logical layout with Hebrew, Arabic and English support.
- Existing navigation and case-progress appearance remain intact.

## Colors

The palette is the existing cool navy and slate vocabulary. Theme custom properties remain the source of truth for shared primitives; the local document metadata and home supporting text use their evidenced scoped colors.

### Primary
- **Office navy:** Primary controls, icons, focus rings and the active document filter.
- **Deep navy:** Headings, secondary button text and pressed primary controls.
- **Sidebar selection blue:** Existing active navigation treatment; retain it through the incumbent sidebar item.

### Neutral
- **White:** Panels, document lists, inputs and popup surfaces.
- **Cool pale surface:** Neutral status, icon wells and the segmented track.
- **Fine divider:** Panel boundaries and separation between repeated rows.
- **Slate:** Main text and the existing desktop sidebar background.
- **Secondary slate / home muted slate:** Supporting copy, file metadata and dates.

Status colors are contextual evidence, not another brand accent: the document status uses amber for a pending personal action and green for a personal signature. Every status also has translated text. A green personal signature is not a claim that all parties completed the document.

**The Existing Theme Rule.** Extend the current theme and component variants; do not introduce a parallel portal palette or a new navbar skin.

## Typography

**Body and heading font:** Heebo through the existing `--lw-font-stack`, with the platform's system and multilingual fallbacks. There is no separate display face.

The ramp is restrained and functional: the home heading is fluid; repeated section headings, file titles, body copy and metadata step down without decorative labels. Document-page headings use the evidenced desktop/mobile sizes from their stylesheet; they are surface-specific, not another global display scale.

File names and document-detail headings use natural direction and can wrap. New repeated file rows allow long strings to break instead of relying on single-line truncation. New action labels can wrap where the home layout requires it. Dates use the platform locale; counts use translated plural forms and tabular numerals where supplied by the component.

**The Readable Identity Rule.** Preserve the complete meaningful file or case name in the available wrapping layout; do not use a decorative ellipsis as a substitute for identifying an action.

## Layout

The home is centered within the existing content shell, with a maximum inline size of 75rem. Its main area has a wider action column and narrower case-summary column; at 62rem and below it becomes one column. Below 36rem, panel padding and gaps tighten and quick-access buttons wrap. The document view has its own maximum of 76rem and a two-column filter/search tool area; below 47.999rem the tools, rows and detail metadata stack. These different boundaries describe the build; do not claim a single universal breakpoint.

Spacing repeatedly uses the small, control-gap, standard, section and spacious values in the frontmatter. Fine row separators group related information inside each white surface. Flex/grid children use zero minimum inline size, wrapping and logical margins/padding so long labels do not force horizontal page overflow.

New primary interactions and the document search wrapper have a minimum block size of 2.75rem. The search input uses 16px text. These are scoped improvements for the new portal controls; they do not imply that every inherited control across the application has this size.

**The Preserve the Shell Rule.** Add destinations through the existing navigation data. Preserve the desktop sidebar, mobile toolbar/drawer and native bottom navigation. CaseMenuItem, CaseMenuItemOpen, ProgressBar, CaseTimeline and StageFileUpload keep their existing appearance.

## Elevation & Depth

Panels and document lists are mostly flat white surfaces with fine borders. Depth remains concentrated in incumbent buttons, active segments and the modal; it is not added to every document row. The existing shell's background treatment is inherited rather than redefined by the portal.

Shared button and popup shadow values and the existing transitions are recorded in the sidecar because the frontmatter schema does not support them. Pressed buttons use the incumbent slight scale response. The home suppresses skeleton animation for reduced-motion preferences; this does not assert a complete reduced-motion audit of all legacy components.

## Shapes

The existing family uses softly rounded rectangular buttons, slightly rounder inputs, larger panel corners and pill-shaped segmented options. Repeated rows are separated by hairlines within a shared rounded surface. The document popup keeps the incumbent floating close control and internal scrolling rather than becoming a new full-screen editor.

## Components

### Buttons

Reuse PrimaryButton, SecondaryButton and TertiaryButton over GenericButton. Primary is filled navy, secondary has a deep-navy border and white surface, and tertiary is transparent. Disabled and performing states stay within the existing component API. New portal focus rings use the primary color with a visible offset. Do not fork these components to imitate their appearance.

### Segmented filter

Reuse SegmentedSwitch within the single My documents destination for all documents, ready actions and personal signing history. The shipped labels are Hebrew `הכול / ממתינים לי / חתמתי`, English `All / Waiting for me / I signed`, and Arabic `الكل / بانتظاري / وقّعتها`. Options share equal flexible width, wrap their labels, and keep the incumbent active navy pill, focus outline and disabled treatment. This control changes the data view; it does not imply that personal signing history contains only globally completed files.

### Panels and document rows

Home sections use a white bordered panel and recurring icon/title/count hierarchy. The document library uses full-width button rows with icon, name, case/date metadata, textual status and directional arrow. Neutral, ready and signed states must remain distinguishable without color alone. Rows open a detail popup rather than immediately performing a signature.

### Input and recovery

Reuse SimpleInput for search. The new scope provides comfortable height and readable input text without modifying the global input component. Keep search-empty, genuinely empty, loading, partial failure and unavailable-document states separate. A failed source retains available documents and shows retry; it must not be dressed as an all-clear success.

### Document popup

Reuse SimplePopUp with dialog semantics, a labelled heading, existing close behavior, contained scrolling and focus restoration. The client document content follows the locale: its scoped `html[dir='ltr'] .lw-clientDocumentDetails` rule sets LTR for English while Hebrew and Arabic retain RTL. This corrects the inherited popup default without changing the shared popup or shell. Keep the file name, personal status, case association, dates and available action labels explicit. Mobile metadata and actions stack. Only show actions from currently authorized metadata; design must not create signing authority or expose an arbitrary requested document ID.

### Navigation and case status

The portal uses home, one My documents destination and case status within the actual shell. Personal signed history is the `signed` filter of My documents, not a separate navigation entry. The home offers My documents and Case status shortcuts; its recent signed documents link opens the same documents destination with `?tab=signed`. The former signed-documents route remains compatible and redirects into that filter. Tenant-aware paths are part of navigation behavior. The selected case route expands an authorized existing case card; it does not introduce a new timeline, completion percentage or case-progress design.

### Actions and personal history

Ready signing is an explicit current-person state. Waiting for another stage or for preparation is supporting information, not a ready action. Personal signature completion and final-document completion have different copy. A returning later-stage signer can appear in both ready actions and personal history; the prior signature does not replace the fresh consent/session requirement. Native signing hands off to the existing browser signing route.

## Do's and Don'ts

### Do:
- **Do** reuse the incumbent theme and components for new client-facing surfaces.
- **Do** preserve navbar and case-progress appearance while adding authorized destinations.
- **Do** wrap long names, use logical spacing and follow the selected locale's direction, dates and plurals.
- **Do** distinguish personal signing history, current required action and final completion in text.
- **Do** expose partial failures and retry without hiding successfully loaded documents.
- **Do** keep new touch controls comfortably sized and keyboard focus visible.

### Don't:
- **Don't** imply that a personal signature means everyone signed.
- **Don't** infer authorization from a name, contact match, URL parameter or visual affordance.
- **Don't** create a new navbar or timeline appearance inside this feature.
- **Don't** use a native signing fallback when the browser handoff is unavailable.
- **Don't** treat synthetic preview captures as production or installed-app proof.

Not canonized: inherited glyph-based navigation/attachment icons, globally hidden scrollbars and the small incumbent popup close target are retained source constraints, not recommended primitives for future surfaces. Neither transition-captured popup screenshots nor one-off layout values establish design tokens.
