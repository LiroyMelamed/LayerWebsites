import { DateDDMMYY } from "../../functions/date/DateDDMMYY";
import SimpleContainer from "../simpleComponents/SimpleContainer";
import { Text12, Text16, TextBold24, TextBold32 } from "../specializedComponents/text/AllTextKindFile";

export default function TermsOfConditons() {
    return (
        <SimpleContainer style={{ flexDirection: 'column' }}>
            <TextBold32>תנאי שימוש לאפליקציה MelamedLaw</TextBold32>
            <Text12 style={{ marginTop: 8 }}>{`תאריך עדכון אחרון: ${DateDDMMYY(new Date())}`}</Text12>
            <Text16 style={{ marginTop: 12 }}>ברוכים הבאים לאתר ולשירותי MelamedLaw. השימוש באתר ובשירותים שלנו מותנה בקבלתך את תנאי השימוש המפורטים להלן.</Text16>
            <TextBold24 style={{ marginTop: 16 }}>1. הסכמה לתנאים</TextBold24>
            <Text16 style={{ marginTop: 8 }}>• על ידי שימוש באתר או בשירותים שלנו, אתה מסכים לתנאי השימוש ולמדיניות הפרטיות שלנו. אם אינך מסכים לתנאים אלו, עליך להימנע משימוש בשירותים שלנו.</Text16>

            <TextBold24 style={{ marginTop: 16 }}>2. השירותים שאנו מספקים</TextBold24>
            <Text16 style={{ marginTop: 8 }} shouldApplyClamping>{`אנו מספקים שירותי ניהול תיקים משפטיים הכוללים:

                • יצירה וניהול תיקים
                • ניהול לקוחות
                • ניהול שלבי התיק ותיאורי שלבים
                • תגיות וסינון תיקים
                • הרשאות משתמשים ואבטחה`}</Text16>

            <TextBold24 style={{ marginTop: 16 }}>3. הרשמה וחשבונות משתמש</TextBold24>
            <Text16 style={{ marginTop: 8 }} shouldApplyClamping>
                {`• השימוש בשירותים מחייב הרשמה עם מספר טלפון וקבלת קוד OTP לזיהוי.
                  • בעת ההרשמה, ייתכן שנשמור נתונים כמו שם, מספר טלפון, כתובת אימייל ושם חברה.
                  • השימוש במערכת מוגבל למשתמשים שהוקצו להם תפקידים (Admins ו-Users).`}
            </Text16>

            <TextBold24 style={{ marginTop: 16 }}>4. פרטיות והגנה על מידע</TextBold24>
            <Text16 style={{ marginTop: 8 }} shouldApplyClamping>
                {`• המידע שלך נשמר במסד נתונים מאובטח ב-Azure SQL.
                  • אנו משתמשים באימות באמצעות JWT כדי להגן על גישת המשתמשים.
                  • מידע אישי לא יועבר לגורמים שלישיים ללא הסכמתך, למעט מקרים בהם הדבר נדרש על פי חוק.`}
            </Text16>

            <TextBold24 style={{ marginTop: 16 }}>5. שימוש הוגן ואיסורים</TextBold24>
            <Text16 style={{ marginTop: 8 }} shouldApplyClamping>
                {`בעת שימוש בשירותים שלנו, הנך מתחייב:

                  • לא להשתמש בשירותים למטרות בלתי חוקיות.
                  • לא לשבש את פעילות המערכת או לנסות לפרוץ למאגרי המידע.
                  • לא להעביר מידע כוזב או מטעה.`}
            </Text16>

            <TextBold24 style={{ marginTop: 16 }}>6. אחריות ושיפוי</TextBold24>
            <Text16 style={{ marginTop: 8 }} shouldApplyClamping>
                {`• אנו עושים מאמצים לספק שירותים יציבים, אך אין אנו מתחייבים לזמינות רציפה של השירות.
                  • החברה לא תהיה אחראית לנזקים עקיפים, תוצאתיים או נלווים כתוצאה מהשימוש בשירות.
                  • המשתמש אחראי לשמירה על נתוני הגישה שלו ולאבטחת המידע שהוא מזין.`}
            </Text16>

            <TextBold24 style={{ marginTop: 16 }}>7. שינויים ועדכונים</TextBold24>
            <Text16 style={{ marginTop: 8 }} shouldApplyClamping>
                {`• אנו שומרים לעצמנו את הזכות לשנות את תנאי השימוש בכל עת. עדכונים יפורסמו באתר והשימוש בשירות לאחר עדכון התנאים יהווה הסכמה לתנאים החדשים.`}
            </Text16>

            <TextBold24 style={{ marginTop: 16 }}>8. יצירת קשר</TextBold24>
            <Text16 style={{ marginTop: 8 }} shouldApplyClamping>
                {`• אם יש לך שאלות בנוגע לתנאי השימוש, ניתן ליצור איתנו קשר בכתובת: Liav@MelamedLaw.co.il.`}
            </Text16>

        </SimpleContainer>
    );
}