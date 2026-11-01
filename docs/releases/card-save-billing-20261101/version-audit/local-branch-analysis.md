# Legal tenant Git topology and payment baseline — 1 November 2026

Historical baseline analysis below used main `047567a8` and the recorded tenant
tips. Main later advanced to `53d177ee`; see the
[current branch/locale analysis and revised plan](BRANCH-FOLLOWUP.md). This old
ancestry table and runtime/artifact comparison are retained as timed evidence,
not assertions about the final combined release candidate.

Read-only analysis. No branch, worktree, client environment, runtime, database or
deployment was changed by this analysis. Source was the canonical repository at
`/Users/liroymelamed/Projects/LayerWebsites`, whose current checkpoint checkout was
left intact. The parent audit independently confirmed the following canonical
remote-tracking SHAs against current GitHub `ls-remote` results. This document
does not infer deployed versions from branch tips.

## Source-of-truth snapshot

`main` is the product source of truth; tenant histories preserve client-specific
source/branding and receive reviewed merges from main. The current runbook is
`docs/DEPLOY_TENANTS_FROM_MAIN.md`. Active targets are Melamedia QA, AshrafEssa,
MelamedLaw and MorLevi. Idm is retired and must remain excluded.

| Ref | Exact GitHub/canonical SHA | Main-only commits | Tenant-only commits | Common ancestor |
| --- | --- | ---: | ---: | --- |
| main | `047567a84101a6afc90fc36a84f5fd860ea24320` | 0 | 0 | self |
| AshrafEssa | `c469ee2e0fb5bee403902c698f6621cb7a08cab3` | 1 | 89 | `22ff67401a1fa15221125059ba3ea0e5557c39c2` |
| MelamedLaw | `0631caf7b1c829673887e12c1d2e3ffc36c1715b` | 44 | 79 | `aac048ed62caf0a0b291f5bacc0571f3440e89e9` |
| MorLevi | `a50afb3fccaaee17633328ef62b5695336d73090` | 44 | 198 | `aac048ed62caf0a0b291f5bacc0571f3440e89e9` |
| Melamedia QA | `36c95fa0da76281b4fe92c8cb687d33332a5e8c8` | 1 | 230 | `22ff67401a1fa15221125059ba3ea0e5557c39c2` |

Counts are `git rev-list --left-right --count main...tenant`; they measure
ancestry, not the number of source changes still missing. Patch-equivalent
commit exclusion changes MelamedLaw to 43/78 and MorLevi to 43/197. Ashraf and QA
each lack only main's `047567a8` retired-Idm propagation/deployment guard. None
of the table's remote tips contains the new local billing fix commits
`6758f644` and `5cf245f2`.

The task's isolated clone initially contained stale tenant `origin/*` refs copied
from the canonical local branches. They were not used as current version truth.
Canonical remote-tracking refs and the independently checked GitHub SHAs above
were used instead; resetting a working tree based on stale refs would be unsafe.

## Payment source is common across all five baseline tips

The following nine files have exactly the same Git blob at main and all four
tenant tips in the table:

| File | Common baseline blob |
| --- | --- |
| `backend/controllers/billingController.js` | `f4c26ca1ec87d15c745cbfbd71419b447ba8f251` |
| `backend/lib/billing/firmBillingService.js` | `c7efa566d3c7c9364b234b45db6370caeded0452` |
| `backend/lib/billing/selfServiceRenewal.js` | `2e50bc55669fa7dd660104a6978b34b9cd535701` |
| `backend/lib/billing/selfServiceUpgrade.js` | `c7e8ba1feaed4ce9e049cf335427c2d3d8ebc5dc` |
| `backend/lib/payments/takbullClient.js` | `f91e9157dcaddb6b66faed5ae5a29e0945af947e` |
| `frontend/src/api/billingApi.js` | `f5078573ae3c64e5c69a8601e81667d4a1c3bec8` |
| `frontend/src/components/billing/TakbullCheckoutDialog.js` | `82262f4edc42239a851f0a2ded8b99a584e8b77f` |
| `frontend/src/screens/billingScreen/PlanUsageScreen.js` | `3c80b0086d3d6e80720e1ff9fcebd55d153039e0` |
| `frontend/src/screens/billingScreen/PlansPricingScreen.js` | `1d283d09b6a85cebbd9363e63a308a6c6949b49c` |

The `billing`, `planUsage` and `planPricing` JSON sections are also semantically
identical in Hebrew, English and Arabic across these tips. Whole locale files
are not identical: MelamedLaw/MorLevi retain older Word/signing strings and QA
has additional client/signature-detection content. Add the payment string keys
with a minimal merge; do not replace whole locale files.

Thus the card-save settlement defect and the local patch are shared product
work at these baselines, rather than an Ashraf-specific payment fork. Blob
identity supports patch-context compatibility; no merge/apply or runtime test
on a tenant branch was performed here.

## Ashraf changes that must be preserved

Ashraf's remote tip includes the owner-administrator fix twice in ancestry:
tenant commit `6ee043f9` and main commit `22ff6740`. Their changed screen/test
contents agree, and the current tree already contains that shared fix. Commit
counts alone would misleadingly classify it as missing from main.

Against current main, Ashraf's backend/frontend net differences are limited to
the outreach suppression/warm-lead helper and two outreach scripts, plus a
dedicated signup system-message consent test. Other net differences are
environment-safety scripts/workflow, setup/release documentation and the
retired-Idm rollout guard missing from the tenant. These differences must be
reviewed for promotion to main separately from the billing patch. Never copy
outreach lists, customer data, environment values or branding as part of that
promotion.

The live Ashraf source SHA reported by the parent audit is
`87e8eaa58830ee9b42772c1619e01814143dc28e`, older than GitHub's `c469ee2e` tip.
The object exists locally. Its payment service and PlanUsage blobs match the
same baseline above. The seven-commit gap is **not a backend feature gap**:
the complete backend Git tree is identical. Frontend source and release evidence
changed later, and frontend publication was independent of that backend HEAD;
the binding evidence below must be used before deciding whether UI is missing.

## Other tenant lineage and policy differences

MelamedLaw and MorLevi's tips diverge before the later main Word authoring,
rendering, responsive signing and attribution changes. A whole-main merge can
therefore advance much more than payment code and must be reviewed/tested as
such. Preserve their tenant-specific source, public entry pages, assets, App
Links and any intentionally held feature baseline.

QA has its own client document-profile, contact/search and signature-detection
work and preserved office WhatsApp lineage. Do not replace it with main or a
client branch merely to reduce divergence. The live QA object reported by the
parent audit, `fb0d6c22640f8b01911a9c6491ec856c4f5ab71a`, is also older than its
GitHub tip by 19 commits; its payment service/PlanUsage blobs match the common
baseline. The only backend Git-tree difference is a new automated test, not
runtime source. An older preserved backend HEAD is not proof of stale runtime
features.

### Commit, backend and frontend are separate version axes

| Tenant/directory | Backend-HEAD snapshot tree | Current remote-tip tree | Interpretation |
| --- | --- | --- | --- |
| Ashraf `backend` | `00005d3653c418e306eada4562e1636ebefae321` | same | All tracked backend files identical |
| Ashraf `frontend/src` | `ceda38521b273eab5e0c315274b8be6c64e0907d` | `4ef5407978d3a11af65b6c7f83fa65c64467abdf` | Later Word/admin/locale UI source; inspect published asset binding |
| Ashraf `frontend/public` | `cae1f9b287479aee65aa616667d9f2b73907704f` | same | Tracked public inputs identical |
| QA `backend` | `9ecbcaa3e953947738c96a0ae2aca4ed7be117d9` | `6e9ea0964016a58f9bf1f30ef64b62fddaecc66f` | Only `backend/tests/wordTemplates.autoFillAcceptance.test.js` was added; runtime source identical |
| QA `frontend/src` | `8daed26f19e93bc23c39378b09d5ea286f5108e7` | `d34b384bc4c8bedbae29084f1b39c5f260eb0fa4` | Later Word/native-template/admin/locale source and tests |
| QA `frontend/public` | `bf0d4030cceee509005cba23214471e10c203fdb` | same | Tracked public inputs identical |

This compares immutable Git snapshots only. It does not establish equality of
installed dependencies, generated files, ignored environment files or any live
uncommitted disk changes; the parent runtime audit checks those separately.

### Frontend publication bindings found in existing release evidence

The public bundle names observed by the parent correspond to separate successful
frontend apply receipts in the existing private
`outputs/ashraf-cases-admin-diagnostic-20261028/latest-rollout` directory:

- Ashraf `FRONTEND-ashrafessa-apply-20261029T072917786690Z.json` pins candidate
  `c469ee2e0fb5bee403902c698f6621cb7a08cab3`, reports exit 0 and
  `FRONTEND_PUBLISHED_STATIC_VERIFIED`, and maps the entrypoints to
  `main.e87a2837.js` / `main.9c198d3e.css`.
- QA `FRONTEND-melamedia-apply-20261028T154432712798Z.json` pins candidate
  `36c95fa0da76281b4fe92c8cb687d33332a5e8c8`, reports exit 0 and the same
  successful publication result, and maps entrypoints to `main.d1cc1564.js` /
  `main.424bb572.css`.

Both referenced build receipts still exist, hash-match their apply receipts,
report stable source and the exact candidate HEAD at finish. Both publication
archives still exist and hash-match their build receipts. Reading those archives
without extracting or executing them produced these exact asset hashes:

| Candidate | Archived public asset | SHA256 |
| --- | --- | --- |
| Ashraf `c469ee2e` | `static/js/main.e87a2837.js` | `77bcd5beaa27fa742399472012e0c297168058f535ad396b650b925c89043bde` |
| Ashraf `c469ee2e` | `static/css/main.9c198d3e.css` | `4eb46e107bba0591e34e631220b5a9ca3500a46b7de734d96b640807757e3f63` |
| QA `36c95fa0` | `static/js/main.d1cc1564.js` | `b03ef3ddf0dd5f52ae18dfd070d5463e0deac246a2efab5dc26ccb1d877e2667` |
| QA `36c95fa0` | `static/css/main.424bb572.css` | `5bb5886f3f7716f0f277b58c75a389413d7ea40c4ad868571475dc9a4889c962` |

The parent audit can compare current served/server asset bytes to this table.
Filename or mtime agreement alone is insufficient. No newer bundle-name matches
were found in the versioned release documents searched in main/Ashraf/QA; the
older versioned October 28 Ashraf summary binds a different earlier bundle
(`main.e622d4e3.js`) and must not replace the later apply evidence. Only this
sanitized binding summary is added here; no private environment, key, customer
record or full private operational receipt was copied into Git.

One separate billing-policy drift is present in QA's
`backend/lib/billing/tenantBillingDefaults.js`: its MelamedLaw default free-period
cutoff is 31 October, while main and the client baselines use 30 September.
This is code/configuration evidence, not proof of any customer's agreed dates
or current billing row. Reconcile that policy explicitly; never rewrite live
billing data to match either default or let a generic merge decide a contract.

## Safe consolidation plan — not executed

1. Pin this inventory and the latest active legal-thread instructions. Review and
   land the billing commits on main first. Keep the current two-commit local
   patch separate from unrelated Ashraf/QA feature promotion.
2. Promote any genuinely shared Ashraf changes to main through their own
   reviewed patches/tests, while retaining each tenant's source, branding and
   data. Use tree/patch comparisons, not ancestry counts alone.
3. Create a reviewed QA integration candidate from QA's own current source and
   merge main into it. Preserve unique QA/WhatsApp work, merge locale keys
   minimally and resolve the date-default policy explicitly. The Idm retirement
   guard must remain in all propagation/deployment plans.
4. Complete the existing payment, browser, signup-isolation and provider
   document/email gates in QA. Existing missing QA configuration and provider
   read-side-effect holds remain real release gates.
5. Prepare a separate integration candidate from each customer's own current
   reviewed branch. Review the full main-to-tenant scope, including Word changes
   for MelamedLaw/MorLevi, rather than replacing the client tip. Preserve live
   dirty work and use each customer's existing branded build configuration.
6. Only after separate release authorization, pin a release manifest with exact
   per-client backend commit, frontend artifact/hash, schema/migration set,
   health evidence and rollback point. Verify backend and frontend separately.
   A branch name, a pushed commit or an older deployment note is not proof that
   all clients run the same release.

No integration candidate, merge, reset, rebase, deployment, invoice or live
customer mutation was performed by this analysis.
