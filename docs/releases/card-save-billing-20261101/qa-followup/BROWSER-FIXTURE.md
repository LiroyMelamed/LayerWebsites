# Local browser fixture

`browser-fixture.cjs` builds the actual modified billing screens, API adapter,
dialog, pricing controls, hooks, i18n, styles, `ScreenSizeProvider` and
`BillingLockProvider` with the existing canonical frontend dependencies. It
replaces only unrelated navigation/toolbar/MainScreen imports, not billing UI.
The bundle and build caches are temporary and outside the source tree.

Run from the repository root:

```sh
node docs/releases/card-save-billing-20261101/qa-followup/browser-fixture.cjs
```

The actual UI is served on `http://127.0.0.1:55701/AdminStack/PlanUsage` and
`/AdminStack/PlansPricing`. A synthetic provider iframe is served on the
separate loopback origin `http://127.0.0.1:55702`. Both listen only on loopback.
Application CSP prevents connections to payment providers or other external
systems. There are no provider credentials and no application `.env` is read.

The fixture writes the literal invalid marker
`local-browser-qa-not-a-credential` to localStorage only when the page origin is
exactly `http://127.0.0.1:55701`. This is not a signed token, account, credential
or access grant. It permits the real lock provider and request interceptor to
exercise the fake local API, which itself requires no authentication. This
marker is never sent outside the local fixture.

The visible QA panel selects `success`, `decline`, `unknown`, or `no-debt` and
resets all synthetic state. It links both actual screens and has a forged
parent-window message button. The iframe has approval and duplicate-approval
buttons. Confirmation waits one second so the UI's checking state is observable.
The visible summary includes synthetic account status, collectible debt, card,
paid/pending flags, checkout and confirmation counts, verification fee and
simulated subscription charges. The detailed API log records plan and lock
refreshes and the exact checkout identity sent for confirmation.

These are browser/component integration tests with a mocked HTTP boundary.
The `simulatedSubscriptionCharges` and `verificationFee` counters describe fixture
responses; they do not establish that a backend or provider collected money.
Backend payment dispatch, database transactions and locks have their own
separate PostgreSQL evidence in the parent release folder. No production
build, tenant deployment, real authentication, provider transaction, document
or email is performed by this fixture.

The first two fixture iterations lacked the CRA environment shim and automatic
JSX transform; those caused harness-only runtime errors. The running version
uses a safe explicit `process.env` object and `runtime:'automatic'`, matching the
application's JSX assumptions. No product source was modified for those errors.
The QA scenario dropdown also now synchronizes its initial selection once;
subsequent status polls do not overwrite the operator's pending selection.
That harness-only race was checked by executing its actual polling snippet and
preserving a selected `decline` across two callbacks.

Stop the process after browser QA with Ctrl-C. It closes only the two servers it
created. Do not reuse this fixture as a production server or point its synthetic
API at a live system.
