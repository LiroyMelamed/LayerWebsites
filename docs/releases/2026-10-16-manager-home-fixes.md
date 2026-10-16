# Manager home corrections — 16 October 2026

This supersedes the calendar and October scoring guidance in the 15 October release.

Later update: [expanded platform scoring](2026-10-16-expanded-scoring.md) supersedes the scoring rules below. Document, signature and creation credit now continues after October.

- The calendar remains the first dashboard section even when today and tomorrow have no events. Its existing empty state and open-calendar button stay visible; module and access permissions still apply.
- Insights describe the measured process directly. The removed Hebrew label is absent from deterministic copy, rejected in generated narrative, and old AI cache entries are invalidated by a new cache version.
- During October 2026 only, scoring combines the durable activity record with identified historical case closures, stage-file uploads, signing-document creation and recorded signing actions. Standalone signing documents qualify too. This is partial history, not proof of complete office activity.
- Repeated actions earn at most one point per employee, case/document, action kind and Israel calendar day. Signing creation and its audit entries share a kind, avoiding duplicate credit. A signing action is not proof of message delivery.
- Mutable historical stage updaters, current case managers, anonymous actions and cross-office actors are not used to invent past authorship.
- At midnight in Israel on 1 November 2026, the historical branch switches off automatically. Only the existing recorded stage-update and closure rules remain; this fallback never recurs in later Octobers.
- This change reads historical rows; it does not backfill or rewrite the database and requires no migration. No real messages are sent by validation.

## Targeted validation

14 scoring scenarios passed, covering the changed query and eight historical-source regressions. Four affected insight scenarios and five new UI regressions passed. Prior unrelated test results are retained; the full suites were not repeated.

Read-only evaluation of the candidate query on all five deployed tenant databases passed. MelamedLaw now produces a monthly ranking from actual historical signing activity, including documents without a case. Results contain only aggregate verification metadata in the local release evidence.

Local evidence: `outputs/home-fix-20261016/`. The [release record](2026-10-16-manager-home-fixes/release-record.json) contains verified tenant revisions, backups and rollout checks.

## הנחיות שימוש לאחר העדכון

- יש לרענן את דף הבית כדי לטעון את הגרסה החדשה. היומן מופיע ראשון גם כשאין אירועים קרובים, כל עוד מודול היומן מופעל ויש למשתמש הרשאה אליו.
- בלוח ״המובילים בצוות״ בוחרים היום, השבוע או החודש. במהלך אוקטובר 2026 הדירוג כולל גם פעולות היסטוריות שניתן לשייך בוודאות לעובד: סגירות תיקים, העלאות קבצים ומסמכי חתימה, ופעולות חתימה מתועדות. מסמכי חתימה עצמאיים נכללים גם ללא שיוך לתיק.
- נקודה ניתנת לכל שילוב של עובד, תיק או מסמך עצמאי, סוג פעולה ויום לפי שעון ישראל. פעולות חוזרות מאותו סוג באותו יום אינן מכפילות את הניקוד. יצירת מסמך חתימה ופעולת החתימה המתועדת עליו באותו יום אינן מזכות בנקודות כפולות.
- מוצגת הבהרה שהניקוד מבוסס על ההיסטוריה הזמינה בלבד. היעדר ניקוד אינו אומר שהעובד לא עבד; לא כל פעולה ישנה נשמרה עם מבצע שאפשר לזהות.
- ב־1 בנובמבר 2026 בחצות, לפי שעון ישראל, המעבר מתבצע אוטומטית לניקוד הרגיל מתוך יומן הפעולות החדש: עדכוני שלב וסגירות תיקים. אין פעולה נדרשת מצד מנהל המשרד.
- היועץ העסקי מתאר ישירות את השלב או התהליך שבו זוהה עיכוב, בלי הכינוי שהוסר. התובנות נשענות על התיעוד הקיים ואינן משנות תיקים.

## Completed rollout

QA and all four customer environments are deployed. The authenticated QA browser showed the empty calendar first, the October notice and historical ranking, and the updated insight wording. The calendar was also checked at a 390-pixel mobile viewport; the temporary viewport override was restored afterwards. Production verification used read-only dashboard queries and exact public asset comparisons, including the lazy-loaded dashboard JavaScript and CSS.

| Environment | Deployed revision |
| --- | --- |
| Melamedia QA | `139282cd2745` |
| MelamedLaw | `80101cb312d9` |
| MorLevi | `6d983d2703d4` |
| AshrafEssa | `5949be7c236d` |
| Idm | `20312f24c0bf` |

Product commit: `f3533a242018143ee490cca4c0f0ce5df7682047`. Annotated release tag: `PROD_16_10_2026_LIROY_HOME_FIXES`, with a separate tag for each tenant branch. All six tags were pushed and their remote target revisions verified. Existing data counts, private configuration, platform settings and office integrations were preserved. No migrations or historical backfill were performed.

## Recovery

Revert the release commit and rebuild each tenant from its own branch, restoring its previous backend revision and backed-up frontend index/assets. No data reversal or SQL rollback is required. Preserve tenant private configuration and restart only that tenant's process.
