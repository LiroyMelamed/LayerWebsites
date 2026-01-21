// Central pricing config used by BOTH public and admin pricing pages.
// Keep all numbers here to avoid magic numbers scattered across UI.

export const PRICING_CONFIG = {
    currency: "₪",
    billingPeriodLabel: "לחודש",

    // Single source of truth for contact numbers used on pricing pages.
    contact: {
        phoneNational: "0507299064",
        // WhatsApp expects a country code without '+'
        phoneE164Digits: "972507299064",
    },

    // Total rule: system base + sum of the 3 selected sections.
    // Keep this explicit to prevent accidental "extra adders" elsewhere.
    totalRule: "sum",

    // AUTHORITATIVE MODEL:
    // 1) The system (המערכת) is ALWAYS included.
    // 2) Platform choices are ADD-ONS on top of the system.
    // 3) Total = System base + Platform add-on + Resources + Signatures
    system: {
        id: "system",
        label: "מערכת",
        amount: 249,
        description: "המערכת כלולה תמיד במחיר הבסיס ומתאימה לניהול משרד.",
        bullets: ["ניהול תיקים", "ניהול לקוחות", "קבצים ומסמכים"],
    },

    platforms: [
        {
            id: "none",
            label: "ללא",
            amount: 0,
            description: "ללא אתר או אפליקציה – רק המערכת הבסיסית.",
            bullets: ["כולל מערכת בלבד"],
        },
        {
            id: "site",
            label: "אתר",
            amount: 149,
            description: "אתר תדמיתי ושיווקי למשרד, עם דפי שירותים ועמודי תוכן.",
            bullets: ["אתר תדמיתי/שיווקי", "טפסי יצירת קשר", "עמודי שירותים/צוות"],
        },
        {
            id: "app",
            label: "אפליקציה",
            amount: 199,
            description: "אפליקציה ללקוחות ולעדכונים שוטפים – ללא אתר שיווקי.",
            bullets: ["אפליקציה ללקוח", "התראות ועדכונים", "חוויית משתמש נוחה"],
        },
        {
            id: "site_app",
            label: "אתר + אפליקציה",
            amount: 299,
            description: "השילוב המלא: אתר שיווקי + אפליקציה על גבי המערכת.",
            bullets: ["כולל אתר + אפליקציה", "חוויית לקוח מלאה", "נוכחות דיגיטלית מלאה"],
        },
    ],

    // Resource / capacity packages
    resources: [
        {
            id: "basic",
            label: "בסיסי",
            amount: 0,
            description: "מתאים להתחלה או למשרד קטן עם שימוש מתון.",
            bullets: ["מתאים להתחלה", "נפח עבודה נמוך-בינוני"],
        },
        {
            id: "pro",
            label: "פרו",
            amount: 149,
            description: "למשרדים פעילים יותר שצריכים יותר קיבולת ותמיכה.",
            bullets: ["קצב עבודה גבוה יותר", "יותר משתמשים/תיקים"],
        },
        {
            id: "enterprise",
            label: "ארגוני",
            amount: 399,
            description: "למשרדים גדולים או שימוש אינטנסיבי עם צרכים מתקדמים.",
            bullets: ["למשרדים גדולים", "נפחי שימוש גבוהים"],
        },
    ],

    // Signing add-on tiers (per month)
    signing: [
        {
            id: "none",
            label: "ללא חתימות",
            amount: 0,
            includedSignatures: 0,
            description: "ללא מודול חתימות. אפשר להוסיף בהמשך.",
            bullets: ["ללא מודול חתימות"],
        },
        {
            id: "500",
            label: "500 חתימות",
            amount: 129,
            includedSignatures: 500,
            description: "חבילת חתימות בסיסית עם יכולות חתימה דיגיטלית.",
            bullets: ["כולל OTP", "ניהול שדות חתימה", "קובץ ראיות בסיסי"],
        },
        {
            id: "1500",
            label: "1500 חתימות",
            amount: 299,
            includedSignatures: 1500,
            description: "חבילת חתימות למשרדים עם נפח חתימות גבוה וצרכי עומסים.",
            bullets: ["כולל OTP", "תמיכה בעומסים", "קובץ ראיות מתקדם"],
        },
        {
            id: "5000",
            label: "5000 חתימות",
            amount: 599,
            includedSignatures: 5000,
            description: "חבילת חתימות לנפחים גבוהים במיוחד.",
            bullets: ["כולל OTP", "נפח גבוה", "קובץ ראיות מתקדם"],
        },
        {
            id: "unlimited",
            label: "חתימות ללא הגבלה",
            amount: 999,
            includedSignatures: null,
            description: "חבילת חתימות ללא הגבלה לנפחי עבודה גבוהים מאוד.",
            bullets: ["כולל OTP", "ללא הגבלה", "קובץ ראיות מתקדם"],
        },
    ],
};

export function buildWhatsAppUrl(message, phoneE164Digits = PRICING_CONFIG.contact.phoneE164Digits) {
    const msg = encodeURIComponent(String(message || ""));
    return `https://wa.me/${phoneE164Digits}?text=${msg}`;
}

export function getPricingSelectionDefaults() {
    return {
        platformId: PRICING_CONFIG.platforms[3]?.id || "site_app",
        resourceId: PRICING_CONFIG.resources[1]?.id || "pro",
        signingId: PRICING_CONFIG.signing[1]?.id || "500",
    };
}

export function resolvePricingLineItems({ platformId, resourceId, signingId }) {
    const system = PRICING_CONFIG.system;
    const platform = PRICING_CONFIG.platforms.find((p) => p.id === platformId) || PRICING_CONFIG.platforms[0];
    const resource = PRICING_CONFIG.resources.find((r) => r.id === resourceId) || PRICING_CONFIG.resources[0];
    const signing = PRICING_CONFIG.signing.find((s) => s.id === signingId) || PRICING_CONFIG.signing[0];

    const breakdown = [
        { id: "system", label: system.label, amount: Number(system.amount || 0) },
        { id: "platform", label: `פלטפורמה: ${platform.label}`, amount: Number(platform.amount || 0) },
        { id: "resources", label: `חבילת משאבים: ${resource.label}`, amount: Number(resource.amount || 0) },
        { id: "signing", label: `חבילת חתימות: ${signing.label}`, amount: Number(signing.amount || 0) },
    ];

    const total = breakdown.reduce((sum, it) => sum + Number(it.amount || 0), 0);

    // Dev/demo guardrails (no runtime behavior changes in production).
    const isDemoMode = typeof window !== "undefined" && Boolean(window.__LW_DEMO_MODE__);
    const isDev = typeof process !== "undefined" && process?.env?.NODE_ENV !== "production";
    if (isDemoMode || isDev) {
        const sum = breakdown.reduce((acc, it) => acc + Number(it.amount || 0), 0);
        console.assert(
            breakdown.length === 4 && breakdown[0]?.id === "system",
            "[pricingConfig] Breakdown must be 4 rows and start with system",
            { breakdown }
        );
        console.assert(
            Number(breakdown[0]?.amount || 0) === Number(PRICING_CONFIG.system.amount || 0),
            "[pricingConfig] System base must always be included",
            { system: breakdown[0], expected: PRICING_CONFIG.system.amount }
        );
        console.assert(total === sum, "[pricingConfig] total must equal sum(breakdown)", { total, sum, breakdown });
    }

    return {
        system,
        platform,
        resource,
        signing,
        breakdown,
        total,
    };
}
