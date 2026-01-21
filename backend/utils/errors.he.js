// Central Hebrew (עברית) error messages.
// Keep error codes in English (stable for frontend logic).

const MESSAGES = {
    AUTH_REQUIRED: 'נדרש להתחבר.',
    UNAUTHORIZED: 'נדרש להתחבר.',
    FORBIDDEN: 'אין לך הרשאה לבצע פעולה זו.',

    TOKEN_EXPIRED: 'הקישור פג תוקף.',
    INVALID_TOKEN: 'קישור לא תקין.',

    VALIDATION_ERROR: 'נתונים לא תקינים.',
    INVALID_PARAMETER: 'פרמטר לא תקין.',

    RATE_LIMITED: 'יותר מדי בקשות. נסה שוב מאוחר יותר.',
    REQUEST_TOO_LARGE: 'הבקשה גדולה מדי.',
    REQUEST_TIMEOUT: 'הבקשה ארכה זמן רב מדי.',

    DOCUMENT_NOT_FOUND: 'המסמך לא נמצא.',
    SIGNING_ALREADY_COMPLETED: 'המסמך כבר נחתם.',

    DOCUMENT_NOT_SIGNED: 'המסמך עדיין לא חתום.',

    SIGNING_SESSION_REQUIRED: 'נדרש מזהה סשן חתימה.',

    SIGNING_DISABLED: 'מודול החתימות אינו פעיל עבור החשבון שלך. ניתן לפנות לתמיכה להפעלה.',

    SIGNING_POLICY_REQUIRED: 'נדרש לבחור מדיניות אימות.',
    OTP_WAIVER_ACK_REQUIRED: 'יש לאשר ויתור על אימות בקוד חד־פעמי.',

    OTP_REQUIRED: 'נדרש אימות בקוד חד־פעמי.',
    OTP_INVALID: 'קוד האימות שגוי.',
    OTP_EXPIRED: 'פג תוקפו של קוד האימות.',
    OTP_LOCKED: 'בוצעו יותר מדי ניסיונות. נסה שוב מאוחר יותר.',
    OTP_INVALID_FORMAT: 'פורמט קוד אימות לא תקין.',
    OTP_NOT_FOUND: 'לא נמצא קוד אימות פעיל. בקש קוד חדש.',

    MISSING_PHONE: 'חסר מספר טלפון עבור המאמת/ת.',
    MISSING_PRESENTED_HASH: 'טביעת האצבע של המסמך חסרה. נסה שוב מאוחר יותר.',

    CONSENT_REQUIRED: 'יש לאשר תנאים לפני חתימה.',
    CONSENT_VERSION_MISMATCH: 'גרסת ההסכמה אינה תואמת.',

    SIGNATURE_SPOT_INVALID: 'מקום חתימה לא תקין.',
    SIGNATURE_SPOT_ALREADY_SIGNED: 'מקום החתימה כבר נחתם.',

    IMMUTABLE_DOCUMENT: 'לא ניתן לשנות את המסמך לאחר שנחתם.',

    FILEKEY_REQUIRED: 'נדרש לציין fileKey.',
    FILEKEY_MISSING: 'לקובץ אין FileKey.',
    INVALID_FILE_KEY: 'fileKey לא תקין.',

    DB_PERMISSION_DENIED: 'שגיאת הרשאות במערכת. פנה לתמיכה.',

    USER_HAS_LEGAL_DATA: 'לא ניתן למחוק משתמש משום שיש לו נתונים משפטיים. ניתן לפנות למנהל המערכת לבירור.',

    NOT_FOUND: 'המשאב לא נמצא.',
    INTERNAL_ERROR: 'אירעה שגיאה. נסה שוב מאוחר יותר.',
};

function getHebrewMessage(errorCode) {
    const key = String(errorCode || '').trim();
    return MESSAGES[key] || MESSAGES.INTERNAL_ERROR;
}

module.exports = {
    MESSAGES,
    getHebrewMessage,
};
