# V3 SQL fixture performance compatibility (local artifact only)

`strict-test-guard.cjs` copies the existing V2 guard and adds a test-only pristine-memory snapshot adapter. Original product code, both original test files, every assertion, the PGlite package and all existing network/filesystem/import/constants guards remain unchanged. The existing four network and two constants canary method is byte-identical to V2. `guard-only.patch` records the adapter changes.

Runner integration, owned by the parent:

1. Run the existing kernel and guard canaries.
2. **Await** `guard.prepareSqlFixtureTemplate()` before evaluating either original test file. An async CommonJS preload is not automatically awaited.
3. Require the selected unchanged original test file.
4. After its test cleanup, retain `guard.assertClean()` and record `guard.fixtureTemplateCompatibility()` alongside existing binding/security metadata.

Preparation uses the closed loader to get raw PGlite 0.5.10 and reads only the pinned local `pglite.data` asset. One harness-owned seed memory database must have zero public tables. Its public `dumpDataDir('none')` API produces an immutable snapshot; preparation awaits the seed's close. Two fresh restores then create different canary tables, prove each sees only its own table and await both closes. Only then does the exact `@electric-sql/pglite` import return a frozen copy of the exports with a no-argument-only PGlite subclass. Each fixture gets fresh options, MEMFS, WASM memory, PostgreSQL instance and transaction locks, with the immutable snapshot/bundle and the vendor's existing compiled-WASM cache reused.

The adapter follows the public snapshot mechanism used by the package's own `clone()`. It changes fixture initialization from repeated initdb to snapshot restore. Passing this harness qualifies the original SQL/assertions under that adapter; it does not qualify repeated default initdb performance or inherited static `PGlite.create()`. The selected original tests use only `new PGlite()`.

Metadata counts harness-owned seed, canary and fixture databases. Raw seed boot internally creates a temporary vendor bootstrap instance; the package invokes that private object's `close()` without awaiting it. These counters do not claim to instrument every vendor-internal object. The package is unchanged.

Only syntax checking and static source/API review were performed locally. No guard execution, PGlite instance, database, test, SSH operation or remote mutation occurred. No runtime improvement or completion within the approved resource/time bounds is yet proven. Existing limits must remain unchanged and elapsed preparation time counts toward them.
