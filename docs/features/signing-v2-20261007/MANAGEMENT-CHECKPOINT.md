# Signing v2 management checkpoint — 7 October 2026

The management component reuses the platform buttons, card, search, segmented controls and theme. All new controls and status labels have Hebrew, Arabic and English translations with locale-aware dates/numbers and RTL/LTR. This is an implementation checkpoint, not a production approval.

Scoped SQL aggregates authorized packages before counting or searching. Two sends from one template stay separate; obligations aggregate as 1/1 + 1/9 = 2/10. Search filters children but retains the authorized parent total. Completion is an explicit workflow state; 100% accepted does not imply PDF/evidence/delivery completion. Cancelled packages are separately reported and excluded from the active denominator.

Validation: six PostgreSQL management tests and eight UI tests pass. Real browser review used 200 synthetic packages / 600 documents at 1280px and 390px in all three languages. Preparation status copy and input sizing were corrected. Browser proof and immutable screenshots are recorded in evidence/management-browser-proof.json. This is a read-only component harness; main-app API integration, bulk actions, authoring, full signing/delivery flows, native and representative capacity gates remain outstanding.
