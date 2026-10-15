# Calendar WEB release receipt — 12 October 2026

The new calendar is deployed to all five customer websites. Each deployment passed exact source, environment, migration, process, health and public compiled-artifact readback. The customer update remains an unsent draft. Native OTA and the final Figma audit have since passed; their separate proof and limits are recorded in [release verification](RELEASE-VERIFICATION.md).

The product runtime is `a746b915d0262eb75c43e2985ffa29eb64f6792e`. The product tag `PROD_12_10_2026_LIROY_CALENDAR` pins that tested runtime. The main branch may include this later documentation-only receipt; it does not change the deployed runtime or move any existing production tag.

| Customer | Deployed source | New tenant tag |
| --- | --- | --- |
| melamedlaw | `6edfeb1f3d69ef3506eedb4b0e37927d1056e4b1` | `PROD_12_10_2026_LIROY_CALENDAR_MELAMEDLAW` |
| morlevy | `93daf72062fcfc08322be6e07ea8d55cc3dfe4da` | `PROD_12_10_2026_LIROY_CALENDAR_MORLEVI` |
| ashrafessa | `466e971e510ec02eef26bd36994dc202f9d15fa1` | `PROD_12_10_2026_LIROY_CALENDAR_ASHRAFESSA` |
| idm | `28adf8e91dbc3ce3f7ce96523f6097c7c01f349b` | `PROD_12_10_2026_LIROY_CALENDAR_IDM` |
| lawyer | `82202c18a5ac09d7e277e68245be86211d403349` | `PROD_12_10_2026_LIROY_CALENDAR_LAWYERPLATFORM` |

Melamedia QA is `e39b3347f2eee45a4b7f1aa15300da42ae942d12`, with the separate tag `QA_12_10_2026_LIROY_CALENDAR`. LawyerPlatform source `82202c18` has the same complete tracked tree as its tested and built source `62948a8c`; its pre-existing runtime changes were preserved through a separate ordinary commit before the final fast-forward. Its compatibility branch is published separately from QA.

All five named API processes restarted once. Only the approved additive `delivery_receipts` JSONB migration ran; existing data and settings were retained. Existing environment and notification flags, old assets, branding and hosting/deep-link configuration were preserved. Verified private rollback checkpoints remain outside Git.

The sanitized verification summary records 49 backend file checks and 36 public entry-file checks, exact candidate/build mappings, reusable focused evidence and its limits. It includes the resolved deployment setup failures: an inherited QA-only URL guard that stopped before changes, and an initial legacy readiness timeout completed on the same stable process without another restart or DDL. Legacy compilation used the explicitly approved incumbent warning policy after proving zero new scoped lint findings; its original CI=true failure remains recorded.

The guide and presentation are [PDF](calendar-user-guide-he-v2.pdf) and [PowerPoint](calendar-user-guide-he-v2.pptx). [Customer update draft](CUSTOMER-UPDATE-HE.md) includes the new calendar, current tag-range calendar bug fixes, mobile popup clipping and equal option spacing. It was not sent. No production calendar fixtures or real provider test messages were created.

Runtime evidence is reusable only while recorded source, dependencies, environment, process, schema and public artifacts remain unchanged. This receipt includes no credentials, private session, raw backup or customer data.
