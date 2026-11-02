# Frozen real-API frontend payloads — local preparation complete

All four local production compiles passed on their exact frozen client source at upstream cutoff `074df752`. This was the single retry after the prior known-not-executed automatic-review rejection. The prior denial record, public-config audit and allowlist files remain byte-identical; no workaround or additional build retry was used.

| Target | Actual compile source | Hashed compiled files | Static-only archive members |
| --- | --- | ---: | ---: |
| Melamedia | `efe1ee371ad96bc76963ac1848076055cb83066b` | 256 | 116 |
| AshrafEssa | `9eaebbdb6c23d56d974546e233b8905d19570ef5` | 255 | 116 |
| MorLevi | `b05d66f9f7873753e520c554f4b2c1c540e6682b` | 253 | 114 |
| MelamedLaw | `21d51f5766e5df0b0ac497fce4cc9d16bdd8bbf5` | 253 | 114 |

All three commands per target succeeded: PDF-worker copy, own-tenant branding and the original CRACO production compiler. Each bundle contains the proven public API base and the root logo matches its own tenant logo. The exact public environment allowlist is recorded in each receipt; no private dotenv was read or copied, no dotenv exists in the archive, no arbitrary inherited REACT_APP setting was passed. Missing public keys preserve the previously verified source defaults.

The installed toolchain was reused without changes. Per-target installed package versions match the frozen lock with zero drift; source/dependency inputs remained stable. Caches and all compiler writes are isolated under `/tmp/layer-billing-deploy-payloads-20261101`. Every compiler ran with OS `deny network*` under the shared heavy-work mutex. There was no application/server startup, provider request, checkout, document, message, database or deployment operation. Normal lint/deprecation warnings remain in the raw logs; they were not suppressed.

[Summary](summary.json) and [independent output/archive/log verification](artifact-verification.json) bind **1,017 compiled-file occurrences**, archive member content and prior-file integrity. Detailed source/environment/lock/compiler/output SHA256 maps are in [QA](melamedia.json), [Ashraf](ashrafessa.json), [Mor](morlevy.json) and [Melamed](melamedlaw.json). Raw logs are adjacent. [Reproduction script](reproduce-prepare-payloads.py) preserves the actual recipe and fixed output paths; an unchanged rerun must choose a new disposable path rather than overwrite these artifacts.

## Publication boundary

These are prepared inputs, **not activation-ready releases**. The static-only tar archives include `static/` files only. They intentionally exclude compiled `index.html`, `asset-manifest.json`, root branding/icons, server configuration and CSP. The complete local compiled trees and entrypoint/hash plans remain available separately for a reviewed publisher; do not blanket-mirror them over a live root.

Activation still requires fresh exact live index/manifest/protected-root bytes and CSP, verified target TLS/source/branding/API, reviewed compare-and-swap replacement of the entrypoint references, and all remaining QA/backup/restore/drain/financial safety gates. Existing chunks/root configuration must be preserved. Historical public HTTPS receipts are not a current compare-and-swap preimage. Nothing here authorizes a real payment or bypasses those holds.
