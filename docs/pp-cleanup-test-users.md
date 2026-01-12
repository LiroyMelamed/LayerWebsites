# PP CLEANUP — TEST USERS ONLY

This repo includes a **one-time** pre-production cleanup script that removes only E2E test users **when it is safe**.

## Safety rules

- The script **aborts** if `IS_PRODUCTION=true` or `NODE_ENV=production`.
- The script **never** `UPDATE`/`DELETE`s `audit_events` (append-only evidence).
- A user is deleted **only if** they have **no** legal/evidentiary links:
  - `audit_events.actor_userid`
  - `cases.userid`
  - `signingfiles.lawyerid` / `signingfiles.clientid`
  - `signaturespots.signeruserid` (if that column exists)

## How to run

Preview only (no changes):

- `node backend/scripts/pp-cleanup-test-users.js`

Apply deletes (transactional):

- `PP_CLEANUP_APPLY=true node backend/scripts/pp-cleanup-test-users.js`

The script prints:
- how many test users were matched
- how many would be deleted vs skipped
- and, when applying, how many users were actually deleted
