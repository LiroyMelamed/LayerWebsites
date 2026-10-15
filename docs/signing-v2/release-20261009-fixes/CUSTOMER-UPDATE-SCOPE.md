# Customer announcement scope — exact production tag delta

Owner correction on 9 October 2026: the earlier cumulative customer announcement has already been sent. The next draft must contain only changes between the previous and current production tags. The next announcement remains unsent; this is a documentation-only correction.

| Tenant | Previous production tag / commit | Current production tag / commit |
|---|---|---|
| MelamedLaw | `production-signing-v2-20261009-melamedlaw` / `180277727e4d926809c6a456ed16e9df0adb9c4a` | `production-signing-v2-20261009-fixes-melamedlaw` / `81f17397bce0c613798b7a848d6916a0e0c3cb4b` |
| MorLevi | `production-signing-v2-20261009-morlevy` / `03fd5e4ab9bd06f2e0c1add170d67495e232538c` | `production-signing-v2-20261009-fixes-morlevy` / `dfcac2b1b22d3bd08857a33e3adb0cd11fd039a3` |
| AshrafEssa | `production-signing-v2-20261009-ashrafessa` / `7da3564a2bc9229b45d66ef8abfd4522973bdd67` | `production-signing-v2-20261009-fixes-ashrafessa` / `0a156bfd590aa0bf0addcdc7fa7a6cb4db84d869` |
| Idm | `production-signing-v2-20261009-idm` / `0ca0de08ea64c5cb470eb29f1b67448d1a7c5cd5` | `production-signing-v2-20261009-fixes-idm` / `3e0ec71e8b6533c2bcbbed3347fac8a65719ccab` |

Common runtime changes inspected from tag-to-tag logs and source diffs:

- `70d88ad7`: startup session/loading recovery, missing template field options, office/client/manual signer lookup, authorized final-only automatic mark, and independent field drawings.
- `dfa900e6`: translated labels for reminder, resend and replacement-revision permissions.
- `79078d7f`: personal stamp upload/drawing through incumbent consent and OTP signing.
- `e4f8b521`, `eb94f66e`: bounded one-page personal PDF stamp conversion and configured PDF worker; multipage stamp upload is explicitly rejected.

The draft excludes the earlier feature launch, evidence-document layout, reminder layout, roles-list spacing, login logo, mobile navigation highlighting and prior general error-notice fixes. These are not new runtime changes in this tag interval. No compliance-screen change appears in this interval, so the unsupported generic compliance claim was removed.

The blank SMTP example change (`3492ea84`) is not described as an actual credential rotation or customer-facing system fault. MelamedLaw-only `f722102e` active-sites settings/CI changes are preserved in that tenant's tag but are not announced as a feature delivered to all tenants. No migration was run in this deployment.

The prior edited cumulative draft was preserved in `outputs/signing-fixes-20261009/CUSTOMER-UPDATE-cumulative-before-tag-scope-correction.md`. `CUSTOMER-UPDATE-HE.md` is the current draft. No application files, production tags, deployments or test results were changed by this copy correction; no tests were rerun and no customer message was sent.
