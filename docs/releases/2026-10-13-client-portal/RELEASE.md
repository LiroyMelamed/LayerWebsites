# Client personal portal release — 13 October 2026

Status: **ALL_SIX_RECEIPTS_VERIFIED**. Git push/tags: pending independent final evidence. Customer update remains an unsent draft.

Feature `3022964c695e55af7f3f3aa3e7de25a30bba1f82`; main integration `8268d1befa10547c2fa94370ae0db72be5448044`.

The client home prioritizes pending actions. One **My documents** destination contains All / Awaiting me / Signed filters. Existing case progress and navbar appearance remain; historical signed links redirect with context. Protected document actions and existing signing routes remain available.

| Environment | Candidate | API | Web |
| --- | --- | --- | --- |
| Melamedia | `d7c0231bc860bbc214aadbf54789937cefb3e3c4` | PASS | PASS |
| MelamedLaw | `0bad9446daceff6a36f810fb479583c08fff1d4f` | PASS | PASS |
| MorLevi | `54a97b68d0bc9c52442a117b6e2e52b01c74658e` | PASS | PASS |
| AshrafEssa | `01e65bafb30be63a7c72e00711d11bcbdcaa3b3b` | PASS | PASS |
| Idm | `801da8e8478ad81c6b6f5de733bf0da843c82fd6` | PASS | PASS |
| LawyerPlatform | `75579158e12212fa46aa3e506af784f131df0b8a` | PASS | PASS |

## Verification

Exact tenant build/artifact/source/environment hashes, unchanged locks/branding, and bounded navigation QA are recorded in release-record.json. Native delta: four actual installed iOS simulator cases, plus explicitly reused unaffected prior evidence. Exact QA Client smoke is PASS.

## Remaining

- Deployment receipts complete; release coordinator still verifies remote Git refs/tags and final guide/Figma delivery.

## Limitations and preserved attempts

- Installed iOS simulator and synthetic native transport, not physical-device or Android proof.
- Customer production accounts were not used for new signing or messaging tests; production checks bind source, public artifacts, health and anonymous access denial.
- Existing configured QA Client uses normal server-issued demo OTP flow; no real provider messages. QA V2 positive data coverage is limited by that fixture.
- No migrations or operational environment changes in this rollout. Existing performance measurements are unchanged; no new load/performance claim.
- Legacy build retains incumbent lint warnings; exact original CI=false setting used and all21 warning files bound unchanged.
- Figma local editable views/exports and full .fig backup verified; cloud synchronization remains unconfirmed due desktop reconnect warning. Git push/tag status requires separate remote ref evidence.
- First QA frontend attempt and Ashraf final publication readback failed on robots.txt; exact incumbent nginx Disallow-all overrides identified and separately hash-bound. Original failed journals remain unchanged; Ashraf recovery is a separate read-only static receipt.
- Lawyer build01 CI=true elevated unchanged lint warnings; build02 restored original CI=false, first proof/log retained.
- Lawyer artifact-check01 assumed tenant manifest; corrected check02 binds inherited public manifest to exact Git source.
- Native cold-open lacked running Metro; recovery served identical prior native bundle, then current four UI cases passed.
- MelamedLaw initial backend SSH refused before execution; exact preexecution readback permitted bounded retry. Original failure retained.
- MorLevi frontend staging SCP and Lawyer read-only host-policy checks encountered temporary SSH refusal before web activation. Their original journals are retained; final receipts, if present, separately bind recovery.
- Browser capture attempts04/05/06 and cropped home-desktop07 were rejected/preserved; final guide/Figma use accepted replacement capture evidence.

## Guide and design delivery

Eight-page Hebrew PDF and interactive HTML guide verified and bound in release-record.json. Customer update remains a draft. Figma local nine-view update and full editable .fig backup verified; cloud synchronization remains UNCONFIRMED.
