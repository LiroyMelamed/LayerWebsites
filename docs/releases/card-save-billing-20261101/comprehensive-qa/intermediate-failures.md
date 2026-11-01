# Intermediate runs and corrections

These failed runs are not the final gate.

1. Initial restricted run: 166 passed, 4 failed, 1 skipped. Three test files
   could not load the missing Sharp dependency, and the HTTP identity test could
   not open its ephemeral listener (`EPERM`). Raw output is retained in
   [`backend-broad.tap`](backend-broad.tap). Sharp was installed at its lockfile
   version in `/tmp`; HTTP tests were rerun with a local-listener allowance.
2. After dependency/listener access, and after the parent's new common package
   transaction guard, an intermediate run reported 184 passed, 4 failed,
   1 skipped. Three package helper unit tests had not mocked the now-required
   `pool.connect` boundary and attempted the unavailable local application DB.
   The connection was refused; no application data was read or written. Those
   stubs now explicitly model the transaction/pending guard, while preserving
   charge-order and recovery assertions. The fourth test expected the old public
   signup config shape and omitted the already-existing October 25 optional
   system-message consent metadata. Its exact expected config now includes
   that documented metadata; the signup-closed/privacy assertions are retained.

The second run's raw temporary final-output path was reused for the corrected
run; this is a summary of the captured test failures, not a recreated raw log.
The final source-pinned gate is [`backend-broad-final.tap`](backend-broad-final.tap):
191 passed, 0 failed, 1 skipped, with an outbound network/application-DB guard.
