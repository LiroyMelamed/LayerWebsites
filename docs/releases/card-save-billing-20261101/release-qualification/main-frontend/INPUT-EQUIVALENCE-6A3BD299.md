# Latest frontend input provenance — 6a3bd299

The actual successful execution remains **920 tests / 107 suites** and a
**253-file production compile** on
`9dd9cb3607ee79434fcfb1aed5a40773e5713789`. The original 9dd9cb36 report,
receipts, logs and prior 6fab2887 proof are preserved unchanged.

The latest donor is **`6a3bd299227291feb0065ae3afa89a1f3ba2967a`**. This
follow-up runs only read-only source/receipt comparisons, with **no new test or
compiler execution** and no source, HEAD, dependency or live-state change.

The [latest machine proof](input-equivalence-6a3bd299.json) checks all **834
frontend files**, **28 scripts**, **ten conservative backend Word/profile helper
files**, package/lock inputs, installed toolchain locks and original receipt/log
hashes. Its frontend AST scan identifies all four actual backend helper import
expressions and the bounded frontend locale-JSON dynamic import. Compile-input
provenance includes the frozen archive, original CRACO/cache-wrapper hashes,
explicit synthetic public environment, resource limits and copied PDF-worker
byte identity. No `.env` file or provider is accessed.

The new runtime delta since `6fab2887` consists only of:

- `backend/lib/qaOutboundNoop.js`;
- `backend/tests/qaOutboundNoop.recovery.test.js`.

The intervening release audit files are recorded separately as non-runtime
inputs. Neither new backend path intersects the imported frontend helper scope.
The complete seven-path backend delta since 9dd9cb36 is also recorded.

This establishes **equivalent frontend inputs** for carrying the existing
qualification to 6a3bd299; it is not a fresh run on that donor. It does not
qualify the new QA-guard behavior or earlier notification/runtime/email changes.
Those require the parent's separate fresh backend gate and its actual evidence.
Provider, full-signup, live complimentary-period preservation and deployment
holds are not changed by this proof.

[Read-only reproduction script](prove-input-equivalence-6a3bd299.cjs). It reads
the frozen original worktree and immutable Git objects, and writes only the
new proof in the current donor's evidence folder. Original raw logs physically
match their receipt hashes; Git staging of ignored logs remains the parent
collector's responsibility.
