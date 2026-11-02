# אישור מוצע ל־QA הקיים בלבד — לא בוצע

**אין שינוי config יחיד שמוכיח כעת בידוד לבדיקת גבייה חיובית.** ההצעה המוכנה היא שלב השהיה ובדיקות חסימה בלבד. אין להציג אותה כהרשאה לגבות, כפתרון לכל פערי QA או כתחליף לשערי גיבוי/restore/rollback פתוחים. כל הקמת סביבה/DB/role/extension במק בוטלה; אין לבנות סביבה חדשה במקום ה־QA הקיים.

## יעד ו־config מדויקים

QA הקיים בלבד: backend `37.60.230.148`, תהליך PM2 `melamedia-api`, פורט3003, DB `melamedia`, role קיים `melamedia_app`. המקור המוצע הוא `8d897c207d6bd30fdee108a52e0eb3b89f025f03`, שקוד המוצר שלו זהה למקור ה־QA שנבדק. אין pm2 restart all ואין שינוי ב־MelamedLaw/MorLevi/AshrafEssa.

| ערך בסביבת התהליך האפקטיבית | ערך מוצע |
| --- | --- |
| `BILLING_OPERATIONS_ENABLED` | `false` |
| `BACKGROUND_JOBS_ENABLED` | `false` |
| `BILLING_RENEWAL_SCHEDULER_ENABLED` | `false` |
| `SIGNING_V2_WORKER_ENABLED` | `false` |
| `WHATSAPP_WORKER_ENABLED` | `false` |
| `WHATSAPP_DEMO_WORKER_ENABLED` | `false` |
| `COURT_DEMO_SYNC_WORKER_ENABLED` | `false` |
| `CENTRAL_SYSTEM_MESSAGES_DISPATCH_ENABLED` | `false` |
| `GIT_SHA` | `8d897c207d6bd30fdee108a52e0eb3b89f025f03` |

הערכים מוזרקים מפורשות לתהליך המזוהה עם עדכון environment של PM2, לאחר שמירת preimage פרטי. אין להסתמך על עריכת dotenv: process environment גובר. אין למחוק/להחליף מפתחות, להעביר Takbull ל־test בלי merchant מאומת, לשנות מחירים/תקופות/מסמכים, להחליף isolation mode או לשנות DB/GRANT. נשמרים noop הקיים ללא חריגים ו־self-service signup סגור. אין שינוי nginx/firewall/גישה במסגרת אישור זה; אם יידרשו, יש להציג חוזה נפרד לפני ביצוע.

## guard והיקף הבדיקה

ה־guard הוא `BILLING_OPERATIONS_ENABLED=false` בקוד המוכשר החדש לפני imports: כניסות שירות פיננסיות, כל גבולות תעבורת Takbull, verify ישיר, callbacks, חידוש/שדרוג/הרשמה, maintenance ומסרים פיננסיים. 14 בדיקות מבודדות הוכיחו אפס קריאות ספק ואפס מוטציות מוגנות. יתר ה־workers מושבתים בנפרד; noop הקיים לבדו אינו חוסם תשלום.

ה־flag **אינו עובד בקוד הישן**, אינו מבטל עמוד ספק שכבר הונפק ואינו מנקז פעולה שכבר יצאה. לכן אין להפעיל עד שהקוד/תהליך/flags נקשרים, producers ישנים נוקזו, אי־ודאות פויסה ותנאי דפים/callbacks חיצוניים הוכחו. אם אין הוכחה — עצירה, לא המתנה שרירותית או מחיקת pending.

לאחר כל התנאים מותרות רק health סטטי, hashes, ו־GET/POST ישיר ל־`/api/webhooks/payments/takbull` ללא כל מזהה לקוח/הזמנה/עסקה, שצריכים להיחסם ב־503+Retry-After60 לפני handler עסקי. אין פתיחת SPA עסקי/checkout/שמירת כרטיס/cron/replay/מסמך/מייל כ־smoke. הבדיקה אינה משנה נתוני לקוחות או תקופות מתנה. לבדיקת גבייה חיובית עדיין צריך fixture סינתטי מבודד ו־mock תעבורה מוכח בתוך QA; אין כאלה מאומתים כרגע ואין לעקוף את guards הישנים.

## חזרה והשפעה

- preimage פרטי של מקור/ארטיפקט/PM2 environment ו־hashes לפני שינוי; אין סודות בדוח או ב־Git.
- עצירת/הפעלת התהליך המזוהה בלבד. אם smoke/flags/PID/אתחול אינם תואמים — לעצור ולהחזיר קוד/config מדויקים; לעולם לא לשחזר DB חי ישן.
- rollback לקוד הישן אינו מכבד את הדגל: לא להפעיל אותו אוטומטית או להחזיר סליקה ל־true. משאירים עצור או תחת fence מאומת עד אישור נפרד.
- למשתמשי QA תהיה תחזוקה בזמן stop/start; פעולות חיוב יחזירו503, וחתימות/WhatsApp/demo/court/central מתוזמנים יושהו. בדיקות QA מקבילות צריכות חלון מתואם; אין השפעה מכוונת על שלושת שירותי הלקוחות האחרים. תורים ו־reservations נשמרים, ללא replay או clear.

## קריאה מקדימה מצומצמת, באישור זהות נפרד

ייצוא schema-only הנוכחי דרך משתמש האפליקציה נכשל. אפשר לאשר שימוש בזהות הגיבוי **הקיימת** OSpostgres עם קשירה מפורשת ל־DBpostgres ול־Unix socket5432/DBmelamedia, לאחר בדיקת זהות read-only. `pg_dump --schema-only --no-owner --no-privileges --no-comments --no-security-labels --lock-wait-timeout=1s` בלבד; פלט פרטי0600 והחצנת hash/count בלבד. אין נתונים, DDL/DML/GRANT, שינוי תהליך או פנייה לספק; לא מחליפים זהות אוטומטית. זה משפר את בדיקת triggers/ברירות מחדל/fixtures ואינו אישור להרצת תשלום.

## נוסח האישור — לא בקשה לפריסה כללית נוספת

> מאשר ב־QA הקיים Melamedia בלבד, ובחלון תחזוקה מתואם, את שינוי שמונת דגלי ההשהיה המפורטים ל־false ואת תג הגרסה לתהליך melamedia-api בלבד. ההפעלה תתבצע רק לאחר סגירת שערי הגיבוי/restore/rollback, ניקוז והגנת callbacks וקשירת הקוד החדש לתהליך. מותרות רק בדיקות חסימה וקריאה שאינן נוגעות בנתוני לקוחות; אין חיוב, עסקת ספק, מסמך, מייל, שינוי DB/הרשאות או שינוי לקוח אחר. אם לא ניתן להוכיח חסימה/חזרה בטוחה, יש לעצור ולא להפעיל סליקה.

[הפרטים והמצבים המלאים](approval.json) · [חוזה הניקוז והגבולות](../deployment-operations/README.md) · [כשירות QA בפועל](../deployment-live-preflight/README.md) · [פערי QA והקמות שבוטלו](../qa-fixture-closure/README.md).
