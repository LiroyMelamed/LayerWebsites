# Independent local integration source review

Captured **2026-11-01T14:20:54.464125+00:00**. This is a source-only review; it did not run runtime tests, contact providers, inspect customer data, mutate branches, or deploy anything. Only this README and its sanitized JSON evidence were written.

Shared integrated input: `176ff60a377136ce6a01b43c1defd23f2fe0674b`, based on shared main `53d177eea8bcdcb882ade913f4afa15c6011da4b`. The client pins below are the immutable inputs observed at review capture; later documentation commits do not establish runtime qualification.

| Client | Client base | Reviewed candidate HEAD | Both inputs are ancestors |
|---|---|---|---|
| AshrafEssa | `c469ee2e0fb5bee403902c698f6621cb7a08cab3` | `1a5dcacf37843bc8f8644efc96a22b38f9b61e42` | Yes |
| MelamedLaw | `0631caf7b1c829673887e12c1d2e3ffc36c1715b` | `b54a4b22f22f0439e312d2faae5d412c49fb597b` | Yes |
| MorLevi | `a50afb3fccaaee17633328ef62b5695336d73090` | `1deb2c6434a7fbfc73c3e4fe239355367e7a2275` | Yes |
| Melamedia | `4a766a35921263260c3139632378444e6550a5e3` | `2378c2803ead8babcf0712dea8ab5f9e96c3b0e7` | Yes |

## Findings

No substantive loss of client behavior was found in the reviewed integration sources.

- Each candidate has **103 protected entries**, all matching their recorded SHA256 values and current worktree bytes. The required shipped ancestor remains `eb94f66e6f1f86e66eeb80112696df7662bcc279`. Ashraf and QA manifests remain byte-identical to their respective client bases. Melamed and Mor use the existing reviewed shared manifest with its exact source units; no hashes were regenerated for this review.
- All **nine billing JavaScript files** and all **three `billing.paymentUnconfirmed` locale values** match the shared integrated input in every client.
- All whole-file changes unique to shared main were retained: **50 Ashraf, 94 Melamed, 98 Mor and 21 QA paths**. Counts compare Git blob identities within `backend/`, `frontend/`, `scripts/` and `.github/`; they are not test counts.
- Whole-file client changes were retained: **7 Ashraf, 20 Melamed, 24 Mor and 52 QA paths**. Melamed has one additional intentional changed client-only path: its accessibility test fixture now imports `MemoryRouter` and wraps two renders. Its assertions and production screen remain intact.
- QA retains all **12 unique locale keys per language**, measured PDF-width correction, signature detection and billing defaults. Whole-file evidence is supplemented by semantic locale-key comparison.
- Targeted Melamed review confirmed 12 key paths byte-identical to `0631caf7`, covering contractor policy/settings/controller/migration, contractor screens, case/signing/public-scope controls and PM2. Its Melamed-only contractor category, database identity validation and explicit empty-recipient behavior remain. Tagged-case filters and `Users` guards survive, with the shared outer-array/case-type normalization added. Existing client portal and public signing routes remain intact.
- Mor branding/process configuration and Ashraf-specific tooling survive. The signing guard script delta versus shared main is executable-file mode only, not weakened validation logic.

## Reproduction basis

The full pinned inputs, comparisons, per-file protected hashes and allowed exception are in [source-matrix.json](source-matrix.json). Reproduce without executing application code:

1. In each temporary worktree, obtain `git rev-parse HEAD`, `git merge-base <client-base> <shared-input>`, and `git merge-base --is-ancestor` for both inputs and the required shipped ancestor.
2. Read each tree with `git ls-tree -r <ref>`. A client-only whole-file unit satisfies `client != merge-base` and `shared == merge-base`; require the merged blob to equal the client blob, except the documented MemoryRouter test fixture. Apply the symmetric rule to shared-only units.
3. Read `docs/signing-v2/release-baseline.json` from the pinned candidate. For every entry, hash the exact bytes returned by `git show <candidate>:<path>` with SHA256, compare to the unchanged expected value, and compare those bytes to the current worktree file.
4. Compare the nine enumerated billing blobs to the shared input. Flatten HE/EN/AR JSON by semantic key; verify all client-only key changes remain and the new payment key matches the shared input.

Whole-file identity checks do not prove all semantics of overlapping edits. The targeted contractor/tagged-case review and the separate runtime gates are distinct evidence. This report makes no claim that the reviewer executed the runtime gates or independently qualified every customer feature.

## Remaining scope and environment gaps

- Root's separate fixture inspection reports: Current temporary worktree expects a relative Word HTTP fixture that is absent. A historical protected-workspace fixture exists but hardcodes old source and destructively resets public on named socket55491, so it is not reusable unchanged for these candidates or borrowable. This is an environment/source-binding fixture gap, not a product defect or a claim that no historical fixture exists anywhere.
- Complete signup release fixture/config and profile PostgreSQL opt-in fixture are unavailable to this task. No new PostgreSQL roles/access or environment restoration authorized.
- Actual converter environment, provider sandbox payment/document type and document email delivery remain unqualified by this source review.
- Mor live frontend identity observation remains separately unresolved; local source agreement is not deployment identity.

No new PostgreSQL roles/access, fixture restoration, historical workspace reuse, live document issuance or delivery was attempted. Root aggregates runtime/build/browser results from the separate gate owners; those results must be read with their own exact source/dependency pins and limitations.
