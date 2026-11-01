# Browser gate on the unified local main candidate

Six real integrated-browser flows passed on source `176ff60a`, incorporating
shared main `53d177ee` and the payment implementation. The actual billing
screens, API adapter, iframe dialog, providers and translations were rendered.
The HTTP API and separate-origin payment iframe were synthetic; no Express-to-
provider end-to-end result, real charge, document or delivery is claimed.

| Flow | Observed result | Evidence |
| --- | --- | --- |
| PlanUsage success | Forged parent message left confirmations at zero. Repeated genuine iframe messages generated one confirmation with the exact intent/order; then saved card, paid state, debt zero and December renewal appeared. The checking state was visibly observed before settlement. | [forged message](spoof.txt), [confirmed state](success-confirmed-state.txt), [image](success.png) |
| PlanUsage decline | Card saved, but debt 1353 and October renewal remain; paid false, zero simulated subscription charges and an unconfirmed notice. | [state](decline.txt), [image](decline.png) |
| PlanUsage unknown and retry | One confirmation, pending true, paid false, original debt/date. The saved-card retry reaches `/api/billing/charge`, remains pending and shows the unconfirmed notice without another simulated charge. | [state](unknown.txt), [retry](unknown-retry.txt), [image](unknown.png) |
| No debt | One verification, saved card, zero simulated subscription charges; the preexisting future renewal remains. | [state](no-debt.txt), [image](no-debt.png) |
| Pricing success | Package checkout carries exact identity into confirmation; only server-confirmed success navigates to PlanUsage. | [state](pricing-success.txt), [image](pricing-success.png) |
| Pricing unknown | Remains on Pricing, refreshes plan/access, displays the unconfirmed notice, pending true and paid false. | [state](pricing-unknown.txt), [image](pricing-unknown.png) |

The existing fixture was adapted only for the unified source root and the
lock-matching frontend dependency tree. Its application components and
synthetic responses were not changed. The preparation script and
[source/build pins](source-pins.json) bind those inputs. All counters are fixture
observations, not real monetary transactions. CSP forbids nonlocal requests.
No application environment, provider credentials or usable login was loaded.

An unprivileged initial listener attempt failed with `EPERM`; the final owned
loopback listeners were allowed explicitly. An iframe keyboard attempt while
the browser was hidden could not obtain its focus root. The browser was then
temporarily shown, and ordinary keyboard focus from the dialog Cancel button
with Shift+Tab and Return operated the iframe button. No script-generated event
or application state injection was used. The temporarily shown browser was
hidden again and the owned tab closed.

Both owned servers on `127.0.0.1:55701/55702` were stopped and verified without
listeners. The owned PostgreSQL cleanup is separately recorded in the backend
gate. No customer environment, provider, email, document or deployment was
changed by this browser gate. Other client candidates have their separate
source/unit/build gates; these six browser flows apply to the unified main
source only.
