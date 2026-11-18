# Stage document requirements disclosure — 18 November 2026

Owner request forwarded from the customer-guide conversation: show a small disclosure arrow like the parent stages section, start the documents area closed, and fade the compact add control in/out. No document data change.

Product `d2e5ddbb`: shared SimpleButton and existing DownArrow icon, accessible expanded state and controlled region, original count visible when collapsed, list/actions hidden, add control not focusable or clickable when collapsed. The add control fades over 180ms; reduced-motion disables the transition. Adding the first requirement opens its editor immediately. Closing/reopening preserves unsaved edits. It does not reload or save records.

Validation:
- 14 tests / 3 suites passed: existing read-only client behavior, explicit send confirmation, status failure handling, empty state, collapse/read counts and preservation of unsaved edits.
- QA `15a0159b`: branded production build passed; authenticated existing demo case starts collapsed, opens with original three items and one received item, closes using Space, hides add control. Read-only live verification, no send/save actions. Desktop only; no new native-device/mobile certification.
- Client branded production builds passed: MelamedLaw `1b55fcb8`, AshrafEssa `314eaf71`, MorLevi `f244c168`. Changed component and stylesheet match main exactly.
- Frontends published without deleting old chunks or replacing branding. Backends and databases unchanged. HTTPS verification compared all entrypoint bytes with each build for QA and all three clients. Melamed FTPS publication additionally preserved 30 root-file baselines and verified TLS.

Evidence: `/Users/liroymelamed/.cache/melamedia-builds/client-guide-20261118/` — screenshots, `client-shas.json`, `https-proof.json`, publication scripts and Melamed FTPS receipt. Run logs and the shared signing ledger record test/build commands and results.

Customer documentation: `docs/releases/2026-11-18-latest-features/`. The 17-page guide and self-contained HTML are preserved in canonical `output/pdf/`. PDF pages, bounds, bookmarks and contents links checked. The guide and customer announcement were prepared, not sent.
