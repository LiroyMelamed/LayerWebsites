# Reminder layout browser harness

Renders the actual reminder popup, SimplePopUp, SimpleTable, ReminderMenuItem and shared styles from the frontend source. Only HTTP hooks/API and the unused default row import are replaced by stubs. All data is synthetic and no API writes or notifications are possible. The list fixture mirrors the RemindersScreen column mapping; live QA separately verifies the actual screen.

From this directory in the repository, run `node build.cjs` after installing the frontend dependencies. Outside the repository, set `REMINDER_QA_FRONTEND` to the absolute `frontend` directory. Copy `mobile.html` and `mobile-list.html` into `dist`, then serve it on localhost (`python3 -m http.server 8766 --bind 127.0.0.1 --directory dist`). Open it with the in-app browser.

Variants: `/?variant=calendar`, `multi`, `no-delay`, `empty`, `client`, `regular`, `list`. Mobile pages embed the actual page at 320 CSS pixels. Test Hebrew RTL, all three channels, deferred date LTR, absent deferral, full calendar button text, close, navigation to eventId=999999, several recipient names and long unbroken names. Check cell/row bounding rectangles and scroll widths for overlap/overflow; desktop grid header and rows must have identical columns.

The harness is a visual and interaction fixture, not a scheduler, provider-delivery or native-app test.
