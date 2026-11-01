# Backend persistence check after reconnection

Result: **PASS_PERSISTENCE_AND_SOURCE_BINDING**. Read-only verification on 2026-11-01T23:15:55.289724+00:00; no tests, source edits, HEAD moves, network, provider or customer-database actions.

Verified the saved latest-main backend and transport-delta receipts plus final backend/transport receipts for all four tenant candidates. Each receipt was checked against the current actual source bytes in its own worktree, its immutable qualified commit and any later audit-only descendants. The root runtime remains `6a3bd299`.

- **19 raw logs** checked against their receipt SHA256 and TAP totals.
- Root retained results: payment **217 passed / 1 skipped**, common **124 / 1 skipped**, pause **14/14**, outbox/consent **33/33**, actual PostgreSQL **57/57**, transport delta **40/40**.
- Each client retained: payment **217 / 1 skipped**, common **124 / 1 skipped**, transport/outbox **40/40**. Overlapping counts are not added as unique tests.
- **18 shared financial/transport production files** compared per client with main; tenant-specific variants were not flattened.
- Actual tracked runtime/test source manifests and HEADs were hashed before and after this check, with differences recorded in the JSON.

[Machine evidence](persistence-check.json)

## Findings

No missing log, changed source pin, hash mismatch, count mismatch or runtime change was found in the requested scope. Root copies also matched the saved originals in all four client worktrees.

This verifies persistence and source binding only. Saved cleanup states that the owned PostgreSQL fixture stopped; no current process or database was queried. Full signup/profile fixture and provider document/delivery holds remain open.
