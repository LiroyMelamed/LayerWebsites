# Backend hardening plan — caching + optimization + anti-abuse

Date: 2025-12-30

## Goals
- Improve API resilience under load/abuse (anti-flood / rate limiting)
- Reduce DB load and tail latency via safe caching
- Prevent accidental data leakage via caching mistakes
- Add lightweight regression coverage for hardening behaviors

---

## A) What to cache

### 1) Dashboard aggregates
Typical candidates (admin + client dashboards):
- Counts by status/stage
- “last N” recent items
- Notification unread count

Why: expensive aggregate queries can be hot and repetitive.

### 2) Lookups / reference data
- Case types list
- Stage definitions / templates
- Static dropdown sources

Why: low cardinality, high reuse, easy invalidation.

### 3) Permissions & role-derived checks (careful)
- “is admin”/role lookups if role is not fully encoded in JWT
- Per-user permission maps

Why: can be hot, but only cache if keys are strictly scoped (userId + tenant if any).

### 4) “Get-by-id” endpoints (selective)
- CaseType by id
- Customer by id

Why: safe if keyed carefully and invalidated correctly; avoid caching “list” with user-scoped filters unless you can guarantee correct scoping.

---

## Cache location: in-memory vs Redis

### In-memory (Phase 1)
Use for:
- Single-instance deployments
- Safest/lowest effort caches (lookups, small aggregates)

Pros:
- No infra dependency
- Lowest latency

Cons:
- Not shared across instances
- Cache lost on restart
- Memory pressure risk

### Redis (Phase 2)
Use for:
- Multi-instance deployments
- Shared rate limiting counters
- Shared caches where consistency matters

Pros:
- Shared across instances
- Better observability/TTL control

Cons:
- Operational dependency

Decision rule:
- Start with in-memory for safe read-only lookups + small aggregates.
- Move to Redis when scaling beyond one node or when anti-flood must be consistent across instances.

---

## Invalidation strategy + TTLs

### General rules
- Prefer short TTL + explicit invalidation on writes.
- Never cache responses that include sensitive/user-private fields without a strict key that includes the user identity.

### Suggested TTL defaults (initial)
- Lookups (case types): 10–60 minutes
- Dashboard aggregates: 15–60 seconds
- Notification unread count: 5–15 seconds

### Invalidation hooks (examples)
- CaseTypes: invalidate `caseTypes:list` and `caseTypes:id:<id>` on create/update/delete.
- Cases: invalidate relevant dashboard keys on stage/tag changes.
- Notifications: invalidate `notifications:unreadCount:user:<userId>` on mark-as-read.

---

## Metrics & logging needed

### Anti-abuse
- Rate limit hits (count + endpoint + key type)
- Top offending IPs (sampled)

### Caching
- Cache hit/miss counters per cache name
- Cache entry count / approximate size (in-memory)
- Evictions / TTL expirations

### DB performance
- Slow query logging threshold (e.g. > 250ms in non-prod)
- Per-endpoint timing + status

---

## B) Implementation sequence (small commits)

1) Rate limiting / anti-flood
- Per-IP global limiter for `/api/*`
- Per-IP stricter limiter for `/api/Auth/*`
- Per-user limiter applied after JWT validation

2) Input validation hardening + authz checks
- Ensure all `:id` params are numeric where required
- Ensure non-admin scopes are enforced consistently

3) Query performance
- Pagination on list endpoints
- Add/validate indexes for hot paths (caseId, userId, createdAt, isRead)
- Fix N+1 patterns (if present)

4) Caching layer (start safest)
- CaseTypes list + get-by-id
- Dashboard aggregates

---

## Status

### Done
1) Rate limiting / anti-flood
- Per-IP limiter for `/api/*` + stricter per-IP limiter for `/api/Auth/*`
- Per-user limiter applied after JWT validation
- Unit tests: `backend/tests/rateLimiter.test.js`

2) Input validation hardening
- Shared strict numeric parsing helper: `backend/utils/paramValidation.js`
- Controllers updated to return `400` JSON on invalid numeric IDs before DB queries
- Integration tests (real routes): `backend/tests/numericParamValidation.integration.test.js`

3) Safe in-memory caching (conservative)
- CaseTypes list caching with strict scoping (admin global, non-admin per-user): `backend/utils/caseTypesCache.js`
- CaseType get-by-id caching (global): `backend/utils/caseTypesCache.js`
- Admin dashboard aggregate caching (short TTL only): `backend/utils/mainScreenDataCache.js`
- Unit tests for scoping/TTL/invalidation: `backend/tests/cache.caseTypes.test.js`, `backend/tests/cache.mainScreenData.test.js`

### Next
4) Security/perf pass
- Rate limit response polish (headers incl. `Retry-After`, consistent JSON error shape)
- Minimal structured logging for rate-limit blocks/auth failures (no PII)
- Request size limits per endpoint class + friendly errors
- Pagination checks on list endpoints + index notes based on observed queries

---

## C) Regression coverage (minimal but meaningful)
- Unit tests for rate limiter window behavior
- “Key scoping” tests for cache keys (user-scoped vs global)
- Negative tests to ensure sensitive endpoints are not cached without scoping
