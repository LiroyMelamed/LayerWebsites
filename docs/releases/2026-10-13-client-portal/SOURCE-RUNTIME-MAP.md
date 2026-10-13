# Source and runtime map

Proposed common tag: `PROD_13_10_2026_LIROY_CLIENT_PORTAL`; no tag existence inferred here.

| Environment | Runtime branch | Prior runtime | Final candidate | Proposed tenant tag |
| --- | --- | --- | --- | --- |
| Melamedia | `Melamedia` | `035c08eae5ab906c32de584e71efd3bd7b26f4fe` | `d7c0231bc860bbc214aadbf54789937cefb3e3c4` | `PROD_13_10_2026_LIROY_CLIENT_PORTAL_Melamedia` |
| MelamedLaw | `MelamedLaw` | `f22bc0e1549a2767c208ced645fe9321feebb82f` | `0bad9446daceff6a36f810fb479583c08fff1d4f` | `PROD_13_10_2026_LIROY_CLIENT_PORTAL_MelamedLaw` |
| MorLevi | `MorLevi` | `308b671e70d9e2ad69882559a99fb7abcd1ead2c` | `54a97b68d0bc9c52442a117b6e2e52b01c74658e` | `PROD_13_10_2026_LIROY_CLIENT_PORTAL_MorLevi` |
| AshrafEssa | `AshrafEssa` | `73db0186efb312c40edc8388e16f28232aa4f22a` | `01e65bafb30be63a7c72e00711d11bcbdcaa3b3b` | `PROD_13_10_2026_LIROY_CLIENT_PORTAL_AshrafEssa` |
| Idm | `Idm` | `ee6f4ae8bcb55579855ee30c16980b2edbc3ca03` | `801da8e8478ad81c6b6f5de733bf0da843c82fd6` | `PROD_13_10_2026_LIROY_CLIENT_PORTAL_Idm` |
| LawyerPlatform | `codex/legal-isolation-runtime-20261012` | `bccec76a2f0635eecc418f2a6d61fddc60a5b1a9` | `75579158e12212fa46aa3e506af784f131df0b8a` | `PROD_13_10_2026_LIROY_CLIENT_PORTAL_LawyerPlatform` |

Main integration is separate from deployed tenant heads. Modern tenant branches retain their branding and existing signing source variants. LawyerPlatform retains its incumbent shared-office routing/auth architecture and dedicated runtime branch; its candidate is not interchangeable with modern tenant builds.
