# Calendar release verification — 12 October 2026

The new calendar is released to all five customer websites and all three registered native production app projects. Figma changes were actually applied and visually reviewed. The customer update and social posts remain unsent/unpublished drafts.

The WEB tag is `PROD_12_10_2026_LIROY_CALENDAR`, pinned to runtime `a746b915d0262eb75c43e2985ffa29eb64f6792e`. Later main documentation commits do not change deployed runtime bytes or move that tag. Five customer source, environment, process, migration, health and public artifact readbacks passed: 49 backend file checks and 36 public entry-file checks. Private verified rollback checkpoints remain outside Git.

The native product tag is `PROD_12_10_2026_LIROY_CALENDAR_NATIVE`, pinned to `61ecd5aafa985755a2a7167a8ecfe0dcee60f60c`. Native source branches and new annotated tags were published normally and their remote/peeled targets verified; prior tags were retained.

| Native app | Published source | Existing runtime | Verified platforms |
| --- | --- | --- | --- |
| melamedlaw | `1a4e37eacd7346f00125d0ccfc19fc38c88014f7` | 1.0.11 | iOS, Android |
| morlevi | `c05dc4d19970ac3fa3e8ed388825406e22da14b5` | 1.0.5 | iOS, Android |
| ashrafessa | `32c0a622c686cddfc9ca187b06563f6b11b4a6df` | 1.0.8 | iOS, Android |

OTA receipts prove provider acceptance and the exact production group, source and runtime for both platforms. They do not prove that every physical client device has installed the update. The existing update flow applies to matching runtime versions. Actual isolated iOS simulator day/week/month/editor interaction and OS calendar permission, save and readback passed. The OS record is one synthetic local event using a fresh local synthetic API payload, not a live QA or customer calendar record. Separate remote QA proof covers two own future fixtures and sixteen HTTP requests with delivery disabled and cleanup verified. Android has Hermes export and focused logic proof; physical device and Android OS interaction are not claimed.

[Figma](https://www.figma.com/design/qnclFuKDylmbBZ9ASZiTet/MelamedLaw?node-id=3-1454) contains the reviewed calendar/editor/sync/message and home-widget changes: 41 owned targets, eight editable component families and 16 source variants. All 49 original pages, existing component masters and incumbent native navigation were preserved; no staged nodes remain. Figma synchronization is Hebrew RTL; runtime Arabic and English proof remains separate. Two captured day-mobile views explicitly retain their genuine scrolled source state.

The [PDF](calendar-user-guide-he-v2.pdf) and [PowerPoint](calendar-user-guide-he-v2.pptx) provide the same 45-page illustrated operating guide. Page 35 explains the installed-app device-calendar permission and direct save flow. The guide exports have not changed in this documentation update.

The [customer update](CUSTOMER-UPDATE-HE.md) includes the new calendar and only the current tag-range bug fixes, including mobile popup content/close-button clipping and equal option spacing. It was not sent. [Structured verification](RELEASE-VERIFICATION.json) and [reusable evidence summary](verification-summary.json) contain only sanitized identities, hashes, public design links and limits. Full failure logs, tokens, private backups and customer data are excluded.

An optional direct native manifest retrieval through the tool returned HTTP403 and remains unverified; no retry or bypass was used. This is separate from the successful authenticated provider group/platform/runtime/source readback and is not evidence of an installed-client failure.
