# Current read-only legal-client deployment baselines

Live observations: **1 November 2026, 22:05:21–22:05:25 UTC**. The parent supplied
fresh GitHub branch tips immediately before this snapshot. No source, branch,
process, configuration, account, customer database, provider, scheduler, document
or email was changed. No new access or remote lock was created. This audit does
not inspect or act on any individual customer's billing account.

## Source, process and frontend identity

| Target | Fresh branch tip supplied by parent | Backend checkout | Published frontend source, independently bound below | Public main JS / CSS |
| --- | --- | --- | --- | --- |
| Melamedia QA | `61507869` | `ca31b04e`, detached | `61507869` | `main.ae388fc0.js` / `main.9bf17f76.css` |
| AshrafEssa | `bc964428` | `ab271c53`, branch AshrafEssa | `bc964428` | `main.b15bba80.js` / `main.42e8b4df.css` |
| MorLevi | `f5220552` | `08f1a988`, branch MorLevi | `f5220552` | `main.15483ae9.js` / `main.42e8b4df.css` |
| MelamedLaw | `5e2da32b` | `5f3a4459`, branch MelamedLaw | `5f3a4459` | `main.93266448.js` / `main.42e8b4df.css` |

Current shared main supplied by the parent is
`9f01a42dcf85ec36a1e4a6d980c86f44e1eab5e9`. The locally qualified billing
candidate `5d5e6c63` is based on older shared main `e3ab31d3`. Its test receipts
must not be relabeled as qualification of an integration with this new main.
No local or remote integration was performed by this audit.

All four backend checkouts have no tracked or staged changes, and their named
PM2 processes are online at the expected source paths. **Each complete backend
tree is byte-identical between its deployed checkout and its fresh branch tip**.
Thus the differing HEAD labels do not establish missing backend runtime code.
All four source checkouts match all **103 protected signing hashes**, with the
required shipped ancestor present and no manifest change by this audit.

Every observed process lacks a `GIT_SHA` environment binding. The checkout,
process path and online metadata do not cryptographically bind already-loaded
Node code to that source commit. The hashes above describe on-disk source and
separately observed static artifacts, not a fresh functional acceptance test.

All **nine billing JavaScript source files** checked on every target still match
the old `0631caf7` billing baseline. None matches the corresponding file in the
local billing candidate `5d5e6c63`. The local billing fix is therefore absent from
the checked-out and publication-bound source paths observed here. The comparison
does not inspect or modify financial state.

## Fresh live checks

- Four unauthenticated **`GET /health`** requests returned **HTTP 200** and
  `ok:true`. They contained no tenant headers, credentials, cookies, query or
  body; redirects were not followed. Source review confirms this is the simple
  liveness route, with no billing snapshot or tenant database probe.
- All four public `asset-manifest.json` files and their main JS/CSS returned
  HTTP 200. Each of the **12 hashes** matches its preserved source-bound build
  archive, independently checked against immutable build/publication receipts.
- Locked static-server reads for QA, Ashraf and Mor independently match those
  same public manifest/JS/CSS hashes: **9/9**. Melamed's public bytes are verified;
  no direct FTPS/static-server write or login was attempted.
- Existing global maintenance and per-tenant locks were available and acquired
  shared/nonblocking for remote metadata/static reads. They were opened
  read-only with `O_NOFOLLOW`; none was created or bypassed.

The previous Mor missing-lock/public-403 observation is **superseded for this
snapshot**: its existing lock is available, its public manifest and main assets
return 200, and their exact hashes match the `f5220552` publication archive.
Changed source, lock state or live bytes invalidate that observation.

Melamed's current branch `5e2da32b` differs from the observed/published
`5f3a4459` only in the SMS-sender display frontend change. Its backend tree is
unchanged. The current public byte hashes still bind to `5f3a4459`; do not claim
that the newer display has shipped from Git ancestry or branch name alone.

## Scope and remaining limitations

This is a successful read-only liveness/source/artifact inventory. It does not
verify DB/schema/ACL state, billing recipient configuration, timer health,
payment-provider readiness, payment success, receipt type/delivery or customer
functional behavior. Those remain separate reviewed release gates. Billing
UI/API snapshot reads were deliberately avoided because they can normalize
billing state or expire grace. `/api/platform/v1/health` is a different
DB/service-key endpoint and was not called.

No observation was denied by approval review, deferred for a missing lock, or
left with an uncertain mutation outcome. There was no attempted mutation.
Existing untracked remote files were neither enumerated as disposable nor
deleted. Idm is retired and excluded from every target list.

Before a future authorized release, refresh both branch/source and live asset
pins, qualify the exact combined candidate, and preserve these source/front
dimensions separately. Do not reset a backend just to make its label match a
frontend-only branch advance, or copy another office's state/configuration.

[Exact live metadata](live-baselines.json) · [source/artifact bindings and
comparisons](source-artifact-bindings.json) · [collector](collect-readonly.py) ·
[local health/receipt review](local-health-receipt-review.md)
