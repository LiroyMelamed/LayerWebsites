# Frontend payload preparation — approval blocked

The public compile-configuration audit completed, but **no actual-API payload
build started and no payload was produced**. Automatic approval review rejected
the local four-client preparation operation because it did not find trusted
user authorization for deployment preparation within the billing-fix request.
The command was rejected before process creation. The target directory and
build script were confirmed absent; no retry or indirect execution was used.

[Exact action/status/reason](approval-block.json).

## Completed safe work

- Existing main/client QA receipts, raw log hashes, frozen 074 source/carry
  proofs and all 1,270 compiled-file occurrences were verified after
  reconnection. [Persistence report](../reconnection-frontend/README.md).
- Four latest public build contracts and their historical HTTPS/hash-bound
  published archives establish the intended public API/configuration. No raw
  private dotenv was read or copied, and no new access/network call occurred.
  [Recorded source paths, contract hashes and default rules](public-config-audit.json).
- The [explicit public allowlist](public-environment-allowlist.json) preserves
  actual published values and source defaults. Its canonical SHA256 is
  `a291ed29cdcd85bb809471ffbf48e70890b3206037be9096a2b40bf6d84c8667`.
  Unused historical native-scheme keys are omitted. Missing multi-tenant,
  firm-name and version keys remain omitted; MelamedLaw's missing language key
  retains its verified Hebrew fallback.

## Concrete local-build plan, not executed

Use the frozen common runtime `6a3bd299` and upstream cutoff `074df752` through
these exact qualified client sources, without changing current checkouts:

| Tenant | Frozen runtime | Proven API base |
| --- | --- | --- |
| Melamedia QA | `efe1ee371ad96bc76963ac1848076055cb83066b` | `https://api-melamedia.mela-media.co.il/api` |
| MelamedLaw | `21d51f5766e5df0b0ac497fce4cc9d16bdd8bbf5` | `https://api.calls.melamedlaw.co.il/api` |
| MorLevi | `b05d66f9f7873753e520c554f4b2c1c540e6682b` | `https://api-morlevy.mela-media.co.il/api` |
| AshrafEssa | `9eaebbdb6c23d56d974546e233b8905d19570ef5` | `https://api-ashrafessa.mela-media.co.il/api` |

After trusted authorization is established, the proposed operation is:

1. Export each immutable frontend/scripts source into a new disposable archive
   under `/tmp/layer-billing-deploy-payloads-20261101`.
2. Reuse the exact locked frontend installation; allow only proven public keys,
   standard production controls and essential local process variables. Create
   no dotenv file and inherit no arbitrary `REACT_APP_*` configuration.
3. Apply only that tenant's branding inside its archive, retain normal CRACO
   lint/bundler logic, and isolate all compiler caches under the new path.
4. Compile under OS network denial and the existing global resource mutex;
   never boot the app or contact APIs/providers. Record source, environment,
   dependency, compiler and artifact hashes for review.
5. Prepare new static-only archives, manifest and compiled-index references.
   Preserve prior synthetic QA outputs and label them independently.

The existing reviewed publisher preserves root/server configuration, branding,
native handoff and live HTML metadata, keeps old chunks and swaps entrypoints
with compare-and-swap checks. Full compiled archives must not be treated as a
blanket overwrite payload. Historical public receipts do not establish current
served CSP headers or current index/manifest/protected-root bytes. Those remain
explicit activation preflight inputs; no guessed HTML/CSP rewrite is proposed.

The proposed local-build permission does not authorize deployment, intentional
charges, provider transactions, customer messages or billing-data changes.
Existing signup/provider/complimentary-period preservation holds remain intact.
The root coordinator must supply the existing exact trusted user authorization
or obtain explicit approval if that authorization does not exist.
