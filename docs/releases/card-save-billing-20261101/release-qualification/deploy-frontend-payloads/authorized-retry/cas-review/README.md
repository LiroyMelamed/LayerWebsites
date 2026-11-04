# Current public snapshot → byte-preserving CAS plan

**Four local dry-runs passed. No files were published.** The fresh public HTML,
asset manifest and six entrypoints per tenant matched the latest source-bound
published receipts. Each actual captured HTML body was merged only with its
new frozen build's manifest by the original reviewed pure merger SHA256
`f14e06dc848c00e2780a2af1a9a6536aa04f71978d6e1b754121fe0f2d7f5fd1`.
The full original HTML was not replaced by the compiled index.

| Target | Entrypoint attributes | Captured index SHA256 prefix | Proposed index SHA256 prefix |
| --- | ---: | --- | --- |
| melamedia | 6 | `647fa89d259a` | `4f14b45971ba` |
| ashrafessa | 6 | `74119c645e44` | `ecd3a647875b` |
| morlevy | 6 | `624a600c5287` | `5535f7bd0b19` |
| melamedlaw | 6 | `422bb853e610` | `dd22569aab1c` |

Each old entrypoint reference occurs exactly once; role sets match; the mapping
is invertible. Inverse substitution restores **every original byte**. Inline
script/style blocks, metadata, native handoff/bootstrap, SEO/branding and all
non-entrypoint root references are unchanged. Every new entrypoint is contained
in the verified static-only archive with its full recorded content hash.
The current and proposed manifests also have exactly identical non-static mappings (`index.html` only). No unuploaded root asset reference is introduced. None of the new entrypoint paths collides with the six currently served entrypoints. The other intersecting static manifest paths (QA/Ashraf21 each, Mor/Melamed19 each) still require full locked canonical filesystem hash checks before upload; they were not broadly fetched here.

Private proposed index/manifest bytes are under
`/tmp/layer-billing-deploy-payloads-20261101/public-cas-dryrun/<tenant>/`.
[Summary](dryrun-summary.json), [QA](melamedia-dryrun.json),
[Ashraf](ashrafessa-dryrun.json), [Mor](morlevy-dryrun.json),
[Melamed](melamedlaw-dryrun.json), [source review](publisher-source-review.json).

## Actual CSP and SRI observation

The captured public HTML responses have **zero enforced CSP headers, zero CSP
report-only headers, zero meta CSP policies and zero nonempty script/link SRI
attributes** for all four targets. This is observed policy **absence**, not a
claim that CSP enforcement is correct or that security policy should change.
No header/server configuration was altered. The proposed HTML preserves the
same absence and every existing header/inline attribute byte at this snapshot.

The reviewed merger fails closed on any nonempty integrity attribute, duplicate
or missing entrypoint reference, role change, noninvertible mapping or stale
entrypoint reference outside src/href attributes. It does not silently strip
SRI or edit CSP. If future captures contain either policy/SRI or different
structure, stop for a fresh reviewed contract rather than weakening these rules.

## What closes, and what remains

**Closed now:** current public snapshot/hash binding, no observed static drift,
entrypoint role/content binding, absence-of-SRI compatibility and the pure
HTML-preservation dry-run. This dry-run performed no network, application
startup or browser JavaScript execution; the parent performed the separate
TLS-verified public captures without cookies/credentials/API calls.

**Not closed by public GETs:** a lock-held canonical target-root inventory and
publication CAS. Public-only reads cannot certify hidden `.htaccess`/server
configuration, every protected root file or every retained old chunk. Raw root
bytes must match the captured served bytes (no unreviewed dynamic nonce/HTML
transform), with current canonical SSH/verified FTPS target binding and existing
maintenance-shared/tenant-exclusive locks. Refresh these facts before apply.
Backend readiness/QA/backup/restore/drain/financial prerequisites remain separate.

The historical publishers are useful reviewed designs, not runnable contracts
for this new release. They contain old incumbent main paths, old QA acceptance
and source identities, and a fresh expiry-bound backend proof requirement. Do
not alter/remove those checks just to make the new payload fit. Their initial
CAS plus exclusive lock assumes cooperating writers; a new reviewed contract
should re-read current mutable/protected bytes immediately before their swaps
and stop on unexpected outside changes.

## Finite publication/return plan — not executed

1. Bind exact frozen source, static tar/member hashes, proposed index and new
   manifest, target/root/protected/old-chunk preimages, TLS identity and fresh
   backend/release readiness in an immutable reviewed packet. Preserve private
   rollback preimages; do not copy full compiled root branding/CSP/native files.
2. Hold the existing canonical locks through the entire operation. Validate
   every remote path/type/symlink condition and full SHA collision before
   adding hashed static files. Add and verify **all static first**, retain all
   old chunks, and never overwrite a same-name/different-content file.
3. Recheck source/target/lease/backend expiry and index/manifest/protected-root
   preimages immediately before mutable writes. Atomically replace each
   manifest/index with the reviewed bytes; preserve both generations' chunks.
   The two-file transition is not a cross-file transaction: partial state is
   recorded and inspected, not blindly retried or automatically rolled back.
4. Verify exact public HTTPS bytes for new index/manifest/entrypoints and the
   unchanged relevant headers/protected assets. Rollback, if approved, returns
   exact index/manifest preimages only while preserving chunks and all current
   customer/payment data. It does not restore an old database or activate code.

Historical build contracts can contain protected old chunks/mutable files as
well as root files, and their root baselines predate the current publication.
The compiled-versus-historical-root differences in the source review are **not**
a fresh drift finding and never authorize a root overwrite. They reinforce the
static-only scope and need for a current canonical protected-root preflight.
