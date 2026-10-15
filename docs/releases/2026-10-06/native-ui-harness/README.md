# כלי בדיקה שנשמרו — 6.10.2026

כלי ADB ו־XCTest שימשו אך ורק באפליקציית QA הסינתטית ובמכשירים שבבעלות המשימה, לפי אישור הבעלים. הם אינם מתקינים מעקף כניסה ואינם משנים מסמכים קיימים.

הסקריפטים נשמרו כפי ששימשו בבדיקות; נתיבי הקלט שלהם מצביעים על מבנה העבודה של המשימה. להפעלה חוזרת יש להכין סביבת QA מבודדת ונתונים חדשים, להתאים את הנתיבים, להשתמש במצב משלוחים noop ובמשימות רקע כבויות, ולשמור על בדיקות הבעלות. נתוני הבדיקה החיים מההרצה הנוכחית כבר נוקו. קובצי קודים, טוקנים, session ו־private state אינם כלולים.

מדידות מקור ו־PDF נמצאות ב־readiness-v10-native-final-evidence; הוכחות הבינארים העדכניים ב־readiness-v14-release-gate וב־readiness-v14-final-document-downloads. אין לייחס צילום היסטורי לבנייה חדשה.

בדיקות המוצר הקבועות שמורות ב־LayerWebsites backend/tests ו־frontend/src/__tests__, ב־LawyerApp tests וב־contractor-monitor tests. פירוט הגרסאות, הפקודות והכיסוי נמצא בקוד ובתיעוד docs/releases/2026-10-06 ב־LayerWebsites. ל־Native יש להגדיר CANDIDATE_WEB_SOURCE_ROOT למקור האתר התואם לפני node --test tests/*.test.cjs.
