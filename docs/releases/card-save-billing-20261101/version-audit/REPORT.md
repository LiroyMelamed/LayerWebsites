# Shared payment fix and legal tenant version reconciliation

**Current update:** main advanced to `53d177ee`; committed billing candidate is
`446aff92`. The [current branch/overlap report and plan](BRANCH-FOLLOWUP.md)
supersede the old source-discovery hold and old main-tip assumptions. The 13:36
deployment observations below remain preserved historical evidence.

Read-only final snapshot: **1 November 2026, 13:36:27–13:36:31 UTC**. No merge,
reset, checkout, pull, deployment, restart, schema/configuration change,
customer-data read or live billing mutation was performed. The only new files
are this audit and its metadata collector/evidence in the task checkout.

## Sources and coordination

The current product rule is `main` first, then Melamedia QA, then individually
reviewed client integrations. Current `WORKSPACE.md` and main's
`docs/DEPLOY_TENANTS_FROM_MAIN.md` list four active targets: Melamedia QA,
MelamedLaw, MorLevi and AshrafEssa. Idm is retired; main `047567a8` enforces its
exclusion. Older AGENTS/deployment paragraphs that still mention Idm must not
override that current inventory.

This audit was reconciled read-only with the active conversation
**המשך שיחת MelamedLaw** and its November 1 source/version reports in
`outputs/cursor-reconciliation-20261101`. At the historical inventory time,
that conversation was locating unpublished Cursor work. The later continuation
resolved attribution and published common profile/filter/mobile-label work on
new main. Unfinished court-mail WIP was stopped and excluded. The current
follow-up replaces that old discovery hold.
No message was sent to start work in that conversation, and no active worktree
was reset or modified here.

The canonical checkout is on a preserved checkpoint, not the product main tip.
The task's isolated clone initially had stale tenant tracking refs from those
local branches. Current GitHub `ls-remote` results were therefore used as the
branch truth, not the checkout's branch label. See
[exact topology/payment analysis](local-branch-analysis.md).

## Current Git and deployment observations

| Tenant | Current GitHub branch tip | Backend source checkout | Process metadata | Current frontend artifact |
| --- | --- | --- | --- | --- |
| MelamedLaw | `0631caf7` | `0631caf7`, branch `MelamedLaw` | named API online | public manifest HTTP 200: `main.d6fb3bce.js`, `main.c4d9a2de.css` |
| MorLevi | `a50afb3f` | `a50afb3f`, branch `MorLevi` | named API online | **unverified**: protected direct read deferred; public manifest HTTP 403 |
| AshrafEssa | `c469ee2e` | `87e8eaa5`, branch `AshrafEssa` | named API online | locked static read: `main.e87a2837.js`, `main.9c198d3e.css`; October 29 artifact mtime |
| Melamedia QA | `36c95fa0` | `fb0d6c22`, detached | named API online | locked static read: `main.d1cc1564.js`, `main.424bb572.css`; October 28 artifact mtime |

At this historical snapshot, GitHub main was
`047567a84101a6afc90fc36a84f5fd860ea24320`; the new observed tip is `53d177ee`
as recorded in the branch follow-up. The billing fix was
local on `codex/card-save-collect-due-20261101` at the start of this audit; no
branch with that name appeared in the remote query. This audit does not publish
it or claim that it is already on main or any customer.

All four backend source checkouts have no tracked or staged differences.
Untracked artifacts were not deleted or treated as disposable. Named process
metadata is filtered; environment values/secrets were not returned. Each
process lacks a `GIT_SHA` marker, so an online process and a source HEAD do not
by themselves cryptographically bind the already-loaded process to that commit
or establish functional acceptance.

The existing maintenance and tenant locks were opened read-only and acquired
shared/nonblocking. No lock file was created or bypassed. MorLevi's frontend
tenant lock was unavailable; a subsequent metadata-only check at 13:37:47 UTC
confirmed that `/run/lock/melamedia-legal-morlevy-release.lock` is absent,
so no direct frontend read was made. HTTP 403 is a separate failed public
observation, not permission to bypass that hold. See
[current locked evidence](live-versions-readonly.json) and
[exact lock-file metadata](morlevy-lock-metadata.json), collected by the
[read-only collector](collect-readonly.py) and a separate file-existence read.

### Commit labels are not feature gaps

Ashraf's backend source directory tree is **exactly identical** at live
`87e8eaa5` and GitHub `c469ee2e`:
`00005d3653c418e306eada4562e1636ebefae321`. Its seven later commits therefore
do not establish missing backend runtime features. They include frontend and
release evidence; the frontend is observed independently above.

QA's live-to-GitHub backend difference is only the added
`backend/tests/wordTemplates.autoFillAcceptance.test.js` (177 lines), not a
runtime backend change. Its nineteen-commit label gap must not be presented as
nineteen missing deployed features.

The current deployed frontend JS and CSS were freshly hashed under the same
locks. **All four actual asset hashes match** the preserved publication
archives, whose build-receipt and archive checksums were independently checked:
Ashraf's artifact is bound to candidate `c469ee2e`, and QA's to `36c95fa0`.
Thus their current frontend releases agree with the legal conversation's latest
publication evidence despite their intentionally preserved older backend HEAD
labels. This is source/artifact identity, not a new functional QA pass. See
[exact asset comparison](frontend-receipt-comparison.json) and the receipt/tree
details in [local branch analysis](local-branch-analysis.md).

The exact payment source baseline is common across **main, all four GitHub
tenant tips, and all four backend source checkouts**: five backend files and
four frontend source files have matching hashes. The billing/planUsage/
planPricing translation sections also agree across the branch tips. Thus this
fix is shared platform work. Whole locale files, whole tenant trees and compiled
frontend artifacts are not interchangeable.

## Changes that must not be flattened

The active legal-thread source audit identifies these separate categories:

- **Shared payment patch:** the card-save/debt settlement, provider document
  request, confirmation UI and tests developed in this task. No new database
  migration is required by this payment patch itself.
- **Other common product work:** newer Word/source mapping/mobile signing and
  owner Add Admin behavior are in current main/Ashraf but not the older
  MelamedLaw/MorLevi baseline. A full main merge there is a broader release,
  including the authoring-render migration and app-role/isolation checks listed
  in the legal-thread alignment report. It is not just a payment deployment.
- **Common work subsequently published:** client document-profile editing,
  guarded tagged-case filters, text/dashboard sizing and bounded mobile Word
  labels are now on main `53d177ee`; preserve these when integrating payment.
  Other QA-private-template/signature-detection paths need their own review;
  do not import the whole QA branch or overwrite newer Word geometry.
- **Tenant-specific state:** preserve Ashraf's agreed complimentary period and
  aligned renewal, hidden-user/meetings behavior, firm sender identity and scoped
  case/integration/email/SMS grants described by the ongoing conversation. Those
  are previously reported tenant settings, **not newly read or validated from
  the customer database by this audit**. Also preserve MelamedLaw's contractor
  monitoring protections and MorLevi's process/branding identity. Git alignment
  never means copying billing rows, customer records, credentials or environment
  values between tenants.
- **Business-policy drift:** QA's code defaults include an October 31 MelamedLaw
  free-period cutoff, versus September 30 on main/client baselines. This cannot
  establish what a customer currently owes. Resolve the policy explicitly,
  outside a mechanical shared-code merge; do not rewrite live billing data.

## Safe consolidation sequence — planned, not executed

A concrete **patch-context** check was also performed after the audit. The
current committed production patch at `446aff92` (nine JavaScript files and
three locale files, including final payment QA fixes) was exported against
`origin/main`. Exactly those twelve paths were archived from each immutable
tenant commit into isolated temporary directories. `git apply --check` passed
for **fresh main `53d177ee`, AshrafEssa, MelamedLaw, MorLevi and Melamedia**;
no patch was applied.
Input patch SHA256:
`f267ca948bb2fed2ba7894bdeac2d83026d43da3a4d1b69c0f256413333973b0`.
The working source hashes stayed unchanged during the check. This is not merge
or functional QA and does not remove any release hold. Any changed source/main/
tenant input requires a fresh check. See [results](patch-compatibility.md),
[exact machine evidence](patch-compatibility.json) and the
[reproduction script](check-patch-compatibility.py).

1. Follow the updated common-main/payment sequence in
   [BRANCH-FOLLOWUP.md](BRANCH-FOLLOWUP.md). Refresh refs before integration;
   preserve published common fixes and exclude stopped court-mail WIP. This
   snapshot is not authority to discard later work.
2. Review and publish payment changes together with current common main,
   preserving its profile/filter/mobile-label fixes. Keep tenant data/config,
   branding and unresolved business overrides out.
3. Integrate main into a candidate based on QA's own reviewed source. Preserve
   unique QA lineage, merge only the new locale keys and keep providers OFF.
   Keep `047567a8` retirement protections. Do not run old all-tenant scripts or
   equate branch ancestry counts with missing features.
4. Qualify that exact combined QA candidate: payment regression, actual browser,
   complete signup/isolation fixture, provider test-account identity and receipt
   type/delivery. The missing signup configuration and provider settings-read
   side-effect holds from this task remain open; no QA pass is invented here.
5. Prepare a separate three-way client integration for each active customer.
   Review the entire main-to-tenant difference, including required Word schema
   and ACL work for MelamedLaw/MorLevi. Preserve Ashraf's current functionality,
   branding, business settings and scoped grants. No customer source is reset to
   another tenant's tip and no whole locale file is copied over it.
6. After separate release authorization, record exact per-client source commit,
   backend runtime binding, frontend artifact checksum/build source, schema set,
   gates and rollback point. Publish QA first, then one client at a time using
   existing maintenance/tenant mutexes and named-process controls. Reverify
   backend and frontend separately. First resolve the MorLevi frontend evidence
   hold rather than asserting its historical artifact is current.

No integration candidate, merge, push, deploy, process restart, invoice,
accounting correction or customer-setting synchronization was executed by this
audit. The remaining blocked observation is MorLevi's frontend identity; it was
deferred rather than denied or left with an uncertain mutation outcome.
