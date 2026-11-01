# Current common-main and billing candidate follow-up

This supersedes the earlier source-discovery hold and main-tip assumptions in
the **13:36 UTC historical deployment inventory**. That inventory is retained;
no new live deployment is inferred from branch reads. No merge, apply, ref
change, canonical fetch, deployment or client-data operation was performed.

## Fresh branch truth

GitHub `ls-remote` and independent canonical remote-ref reads now agree:

| Target | Exact observed GitHub SHA |
| --- | --- |
| main | `53d177eea8bcdcb882ade913f4afa15c6011da4b` |
| AshrafEssa | `c469ee2e0fb5bee403902c698f6621cb7a08cab3` |
| MelamedLaw | `0631caf7b1c829673887e12c1d2e3ffc36c1715b` |
| MorLevi | `a50afb3fccaaee17633328ef62b5695336d73090` |
| Melamedia QA | `36c95fa0da76281b4fe92c8cb687d33332a5e8c8` |

The four tenant tips are unchanged. Main advanced seven commits beyond
`047567a8`: `cba0ff84` shared client document-profile editing;
`82bb0e50`/`8c955aa6` separated mobile Word labels and bounded dense placement;
`823d403b` pinned case filters, text clamping and dashboard sizing; and
`cf3bf14e`/`60232c74`/`53d177ee` scope/fixture and hoist-safe tests.

The active **המשך שיחת MelamedLaw** conversation resolved the Cursor
attribution: the October 29 Ashraf Word publication was already known. The
unfinished court-mail WIP was stopped under the owner's instruction and must
not ship. The common profile/filter/mobile-label work is reported tested and
committed on main, with integrated QA being prepared before client rollout.
This is coordination status, not a deployment claim by this audit.

## Committed payment candidate and overlap

The payment candidate is now committed at
`446aff92546f11280b5a8ff053676833ea86cd74`, following `6758f644` and `5cf245f2`.
All twelve production inputs were clean and stable during the final check.
The service SHA256 is
`5f6ecd8d26503d7a79a082809907df309da0c19b875fbb31e5f87facb2280e80`.

The common-main advance overlaps the payment patch at the **file level only in
the three locale JSON files**. None of the nine billing JavaScript files changed
on new main. Each locale has 34 changed common-work keys; this patch adds only
`billing.paymentUnconfirmed`. There are **zero shared changed keys and zero
overlapping original-line hunks** in Hebrew, English and Arabic. Whole locale
files still must not be replaced.

The full production patch against the unchanged local patch base
`origin/main` = `047567a8` passed `git apply --check` against **new main
`53d177ee` and all four tenant SHAs: 5/5 context-compatible**. Exactly twelve
paths were archived into temporary directories, checked without applying, and
removed. Input SHA256:

`f267ca948bb2fed2ba7894bdeac2d83026d43da3a4d1b69c0f256413333973b0`

[Branch/locale comparison](branch-followup-current.json),
[context report](patch-compatibility.md), [exact evidence](patch-compatibility.json).
This is context compatibility, not combined functional QA or release approval.

## Updated safe integration plan — not executed

1. Coordinate committed billing candidate `446aff92` with the ongoing common
   release. Build a review candidate from **new main `53d177ee`**, integrating
   payment changes while preserving published profile/filter/text/Word-label
   work. Do not reset main or clients to this payment branch's older base.
2. Review the combined final diff and locale keys; qualify both common-release
   and payment paths on that exact source. Independent receipts from the two
   conversations are inputs, not an automatic combined pass.
3. Land the reviewed combined product source on main. Refresh refs before QA
   integration so concurrent shared work is not lost. Preserve QA-only features
   and business overrides; exclude stopped court-mail WIP and retired Idm.
4. Integrate qualified main into QA's own lineage and run combined QA, required
   schema/app-role/isolation checks and the existing payment gates. Missing
   signup configuration and provider receipt/delivery holds remain open.
5. After QA and separate release authorization, prepare three-way client
   integrations preserving Ashraf settings/branding, MelamedLaw protections and
   MorLevi identity. Account for the broader Word/schema gap on MelamedLaw and
   MorLevi, not only payment code.
6. Pin each client's backend/runtime and frontend build hashes, schema,
   acceptance and rollback point. Respect existing locks, resolve MorLevi's
   missing frontend-lock/public-403 evidence hold, and publish one authorized
   client at a time. Changed source or target inputs invalidate the context
   proof and require renewed qualification.

The historical live snapshot's artifact hashes prove Ashraf's then-live frontend
bound to `c469ee2e` and QA's to `36c95fa0`, with byte-equivalent backend runtime
code despite older HEAD labels. No later live identity is claimed from these
fresh branch-tip reads alone.
