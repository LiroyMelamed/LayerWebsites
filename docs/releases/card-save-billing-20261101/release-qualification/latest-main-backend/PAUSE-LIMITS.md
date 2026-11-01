# What the local billing pause qualification establishes

Scope is the frozen application source at
`6a3bd299227291feb0065ae3afa89a1f3ba2967a`. Later remote branch advances are not
included in these results. No live deployment, environment value or process was
changed here; the live pause was **not activated**.

`BILLING_OPERATIONS_ENABLED` remains enabled when absent, preserving incumbent
behavior. Explicit `true`/`1` values enable operations; every other configured
value fails closed. Qualification tests supply false only inside synthetic
process fixtures and restore it. Normal-flow tests receive no such flag.

The application gate fences payment creation/charging/verification, financial
settlement/provisioning, renewal/upgrade dispatch and associated billing/welcome
mail before their external or mutating boundaries. Read-only existing signup and
billing snapshots remain available; they do not normalize or repair state,
advance paid periods, or grant a trial. Existing access rules still distinguish
unexpired grace, expired grace and suspended accounts.

Paused financial outbox capture is skipped, and pending or expired-lease
financial messages are excluded from claiming. Those rows remain unchanged.
Unrelated nonfinancial consent messages retain their incumbent workflow; this
is not a global communication shutdown.

Paused IPN GET/POST and financial/return controllers answer **503** with
`Retry-After: 60`, without false success or settlement. A synthetic replay after
resume reaches the original handler. This establishes local non-acknowledgment
semantics, **not** a guarantee that a payment provider retries or retains every
notification.

Before relying on this gate operationally, account for boundaries it cannot
control:

- Old processes or workers without this code, or processes that have not loaded
  the intended configuration, cannot be paused by this local implementation.
- Requests already dispatched, issued hosted checkout pages, already accepted
  provider payments/documents, SMTP submissions and upstream message delivery
  can continue outside the application gate. The gate cannot retract them.
- A rejected callback can correspond to a payment that already succeeded at the
  provider. Drain and reconcile such outcomes before resuming; never infer that
  503 canceled a payment or authorizes another charge.
- The pause does not correct historical accounts advanced by the old card-setup
  bug, calculate multiple arrears, create a ledger, or establish a customer's
  debt. Those remain separate, explicitly reviewed accounting actions.

Full signup and profile-PostgreSQL fixtures, real Takbull sandbox identification,
merchant document settings and actual receipt/email delivery remain separate
holds. A local passing test does not establish production activation, runtime
binding or delivery. Changed runtime source, tests, imports or dependencies
invalidate the relevant qualification; the separate fresh client candidates
require their own evidence.
