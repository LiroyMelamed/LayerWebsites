# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Legal office teams across practice areas. The calendar redesign's confirmed primary job is managing the day: finding, opening and changing appointments (owner, 11 October 2026).

## Product Purpose

Help offices handle clients, cases, documents, signatures and appointments in one platform. For the calendar, success means understandable daily scheduling and easy access to an appointment's details and editing actions.

## Operating Context

Existing React web application, also used inside mobile WebViews. The owner evaluates visual alternatives together before choosing a calendar redesign.

## Capabilities and Constraints

The incumbent calendar has day, week and month views; personal and permission-controlled office scope; employee, client, case and event-type filters; event creation and editing; and Google/Outlook calendar connections. These capabilities are evidenced by `frontend/src/screens/calendarScreen/CalendarScreen.js`, rather than newly promised features.

Reuse existing platform components wherever possible. Preserve role permissions and existing workflows. Calendar design examples use synthetic appointments and do not modify real calendars. The calendar's new composition remains undecided until the owner chooses a visual direction.

## Brand Commitments

MelaMedia's existing platform identity and tenant branding remain recognizable. This request changes the calendar surface, not the entire platform brand.

## Evidence on Hand

Incumbent calendar code and shared styles; focused mobile calendar evidence under `outputs/calendar-touch-20261011` in the parent workspace; and the owner's mobile screenshots. Synthetic demonstrations are explicitly labelled. No customer data is used in calendar concept images.

## Product Principles

- Prioritize the daily appointment task over configuration.
- Make opening and changing a meeting straightforward on phones.
- Preserve existing capabilities and permission boundaries.
- Compare concrete visual alternatives before implementing a redesign.
- Preserve full week and month planning views for the office, alongside easy daily appointment management.
- Use the owner's pinned airy timeline/card direction on phones, with assigned-manager photos or initials. The final composition is still under review.

## Accessibility & Inclusion

Hebrew, Arabic and English; RTL/LTR layout; readable labels, scrolling and usable mobile touch targets. A WebView remains a web design surface.
