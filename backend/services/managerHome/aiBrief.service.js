const crypto = require('crypto');
const { flattenAttentionItems } = require('./scoring');
const { buildOperationalInsights } = require('./operationalInsights');
const C = require('./constants');
const { MemoryCache } = require('../../utils/memoryCache');
const { callCursorLlm, isCursorLlmConfigured } = require('../cursorLlm.service');

const cache = new MemoryCache({ name: 'managerHomeAiBrief', maxEntries: 20 });

const TENANT_TZ = 'Asia/Jerusalem';
const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const TIER_RANK = { hard: 0, soft: 1 };
const CALENDAR_SIGNAL_TYPES = new Set(['rsvp_pending']);
const NON_OPERATIONAL_EVENT_TYPES = new Set(['leave', 'holiday', 'reminder']);

function isOperationalCalendarEvent(event) {
    const eventType = String(event?.eventType || event?.event_type || '').trim().toLowerCase();
    if (NON_OPERATIONAL_EVENT_TYPES.has(eventType)) return false;

    const title = String(event?.title || event?.subtitle || '').trim();
    if (/\bחופש(?:ה|ת)\b/.test(title) && !event?.caseId && !event?.case_id) return false;

    return true;
}

function formatLocalDateTimeHe(date) {
    try {
        return new Intl.DateTimeFormat('he-IL', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: TENANT_TZ,
        }).format(date);
    } catch {
        return date.toISOString();
    }
}

function buildContextNow(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: TENANT_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(now);

    const pick = (type) => parts.find((p) => p.type === type)?.value || '';
    const hour = Number(pick('hour'));
    let period = 'night';
    if (hour >= 5 && hour < 12) period = 'morning';
    else if (hour >= 12 && hour < 17) period = 'afternoon';
    else if (hour >= 17 && hour < 22) period = 'evening';

    const date = `${pick('year')}-${pick('month')}-${pick('day')}`;

    return {
        iso: now.toISOString(),
        localDateTime: formatLocalDateTimeHe(now),
        date,
        hour,
        period,
        timeZone: TENANT_TZ,
    };
}

function eventStartTime(event) {
    if (!event?.startTime) return null;
    const start = new Date(event.startTime);
    return Number.isNaN(start.getTime()) ? null : start;
}

function isPastCalendarAttentionItem(item, now) {
    if (item.entityType === 'calendar' || CALENDAR_SIGNAL_TYPES.has(item.signalType)) {
        if (item.dueAt) {
            const due = new Date(item.dueAt);
            if (!Number.isNaN(due.getTime()) && due <= now) return true;
        }
    }
    return false;
}

function mapTodayEventFacts(event, now) {
    if (!isOperationalCalendarEvent(event)) return null;

    const start = eventStartTime(event);
    const isUpcoming = Boolean(start && start > now);
    return {
        title: event.title || null,
        startTime: start ? start.toISOString() : null,
        startTimeLocal: start ? formatLocalDateTimeHe(start) : null,
        managerName: event.managerName || null,
        isPotentialClient: Boolean(event.isPotentialClient),
        status: isUpcoming ? 'upcoming' : 'past',
    };
}

function hasBriefLlmCredentials() {
    return isCursorLlmConfigured() || Boolean(String(process.env.CHATBOT_LLM_API_KEY || '').trim());
}

async function defaultBriefLlmCall(messages) {
    if (isCursorLlmConfigured()) {
        const cursorText = await callCursorLlm(messages);
        if (cursorText) return cursorText;
    }
    return require('../aiChatService').callLLM(messages);
}

async function isAiBriefEnabled({ getSettingFn, userId, isPlatformAdminFn } = {}) {
    const getSetting = getSettingFn || require('../settingsService').getSetting;
    const flag = await getSetting('managerHome', 'MANAGER_HOME_AI_INSIGHTS_ENABLED', false);
    if (!Boolean(flag) || !hasBriefLlmCredentials()) return false;
    if (userId == null) return true;
    const checkAdmin = isPlatformAdminFn
        || ((id) => require('../settingsService').isPlatformAdmin(id));
    return checkAdmin(userId);
}

function buildFactsSnapshot(payload, { now = new Date() } = {}) {
    const summary = payload?.summary || {};
    const contextNow = buildContextNow(now);
    const flat = flattenAttentionItems(payload?.attentionItems || [])
        .filter((item) => !isPastCalendarAttentionItem(item, now))
        .filter((item) => {
            if (item.entityType !== 'calendar' && !CALENDAR_SIGNAL_TYPES.has(item.signalType)) {
                return true;
            }
            return isOperationalCalendarEvent({
                title: item.subtitle || item.reasonParams?.title || item.caseName,
                eventType: item.eventType,
                caseId: item.caseId,
            });
        });
    const sorted = [...flat].sort((a, b) => {
        const ta = TIER_RANK[a.signalTier] ?? 1;
        const tb = TIER_RANK[b.signalTier] ?? 1;
        if (ta !== tb) return ta - tb;
        return (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
    });

    const topAttention = sorted.slice(0, 5).map((item) => ({
        signalType: item.signalType,
        priority: item.priority,
        signalTier: item.signalTier,
        caseName: item.caseName || item.subtitle || null,
        managerName: item.managerName || null,
        reasonParams: item.reasonParams || {},
    }));

    const workload = [...(payload?.managerWorkload || [])]
        .sort((a, b) => b.needsAttention - a.needsAttention || b.activeCases - a.activeCases)
        .slice(0, 5)
        .map((m) => {
            const attentionRatio = m.activeCases > 0
                ? Math.round((m.needsAttention / m.activeCases) * 100)
                : m.needsAttention;
            return {
                managerName: m.managerName,
                activeCases: m.activeCases,
                needsAttention: m.needsAttention,
                urgentCases: m.urgentCases,
                unassigned: m.unassigned,
                attentionSummaryHe: m.activeCases > 0
                    ? `מתוך ${m.activeCases} תיקים פתוחים, ${m.needsAttention} דורשים טיפול`
                    : `${m.needsAttention} פריטים דורשים טיפול`,
            };
        });

    const today = payload?.today || [];
    const todayFacts = today
        .map((event) => mapTodayEventFacts(event, now))
        .filter(Boolean);
    const upcomingTodayEvents = todayFacts
        .filter((event) => event.status === 'upcoming')
        .slice(0, 5);
    const pastTodayCount = todayFacts.filter((event) => event.status === 'past').length;
    const upcomingPotentialCount = upcomingTodayEvents.filter((event) => event.isPotentialClient).length;

    const upcomingClientMeetings = (payload?.potentialClients || [])
        .filter((event) => isOperationalCalendarEvent(event))
        .slice(0, 5)
        .map((event) => {
            const start = eventStartTime(event);
            return {
                title: event.title || event.leadCaseName || null,
                startTime: start ? start.toISOString() : null,
                startTimeLocal: start ? formatLocalDateTimeHe(start) : null,
                managerName: event.managerName || null,
                leadName: event.leadName || null,
            };
        });

    return {
        contextNow,
        managerName: payload?.greeting?.managerName || null,
        insights: buildOperationalInsights(payload),
        summary: {
            urgentCount: summary.urgentCount || 0,
            needsAttentionCount: summary.needsAttentionCount || 0,
            attentionQueueCount: summary.attentionRawCount || 0,
            unassignedCases: summary.unassignedCases || 0,
            noActivityCases: summary.noActivityCases || 0,
            signingPending: summary.signingPending || 0,
            signingExpiring: summary.signingExpiring || 0,
            signingExpired: summary.signingExpired || 0,
            signingRejected: summary.signingRejected || 0,
            potentialClientMeetings: summary.potentialClientMeetings || 0,
            todayEventCount: summary.todayEventCount || 0,
        },
        topAttention,
        workload,
        today: {
            count: todayFacts.length,
            pastCount: pastTodayCount,
            upcomingCount: upcomingTodayEvents.length,
            potentialClientCount: upcomingPotentialCount,
            upcomingEvents: upcomingTodayEvents,
        },
        upcomingClientMeetings,
    };
}

function factsFingerprint(facts) {
    const { contextNow, ...stable } = facts || {};
    const forHash = {
        ...stable,
        contextNow: contextNow
            ? { date: contextNow.date, hour: contextNow.hour, period: contextNow.period }
            : null,
    };
    return crypto.createHash('sha256').update(JSON.stringify(forHash)).digest('hex').slice(0, 16);
}

function buildPrompt(facts) {
    return [
        {
            role: 'system',
            content: [
                'אתה אנalist תפעולי למשרד עורכי דין.',
                'קיבלת JSON עם נתונים תפעוליים בלבד מהמערכת, כולל שדה insights עם ניתוח מובנה.',
                'כתוב 4-6 משפטים קצרים בעברית לסיכום תפעולי למנהל/ת המשרד.',
                'בנוסף, הוסף recommendations: 2-3 פעולות מומלצות קצרות בצורת פקודה (למשל "טפלו ב-X חתימות שפג תוקפן").',
                'חובה: השתמש רק בנתונים שסופקו. אל תמציא מספרים, שמות תיקים, מועדים או מסקנות.',
                'השתמש ב-insights לזיהוי סיכונים (signingPressure, workloadHotspots, inactivityBurden, focusAreas).',
                'לגבי מנהלים: השתמש בשדה attentionSummaryHe — הסבר שמתוך X תיקים פתוחים, Y מסומנים כדורשים טיפול.',
                'אל תכתוב שמנהל נמצא "בעומס גבוה" או "תחת לחץ" — זה שיפוטי ולא מועיל. במקום זה, הצע פעולה קונקרטית: "אפשר להעביר תיקים מ-[שם] ל-[שם אחר] כדי לאזן את העבודה" או "שקלו לחלק תיקים בין המנהלים".',
                'המלצות צריכות להיות ברות-ביצוע ולא ביקורתיות.',
                'לגבי תור תשומת לב: summary.attentionQueueCount הוא מספר הפריטים שמוצג בכרטיס "פריטים לטיפול" בלוח הבקרה.',
                `summary.noActivityCases הוא תת-קבוצה בתוך התור — תיקים שלא בוצע בהם שינוי מעל ${C.NO_ACTIVITY_DAYS} ימים, לא סכום נפרד.`,
                `כשאתה מציין תיקים ללא פעילות, השתמש בניסוח ברור עם מספר ימים (למשל: "מתוך 275 פריטים שדורשים טיפול, 133 הם תיקים שלא בוצע בהם שינוי מעל ${C.NO_ACTIVITY_DAYS} ימים").`,
                'אל תשתמש בביטוי "ללא פעילות משמעותית" — זה לא מובן. תמיד ציין מספר ימים ספציפי.',
                'אל תציג את noActivityCases כאילו הוא מחליף את attentionQueueCount — אלו מדדים שונים.',
                'אל תשתמש במונחים "יחס תשומת לב", "attention ratio" או "attentionRatio" — ניסוח לא מובן למשתמש.',
                'שדה contextNow מציין את השעה הנוכחית בישראל — התייחס אליו לקביעת מה קרוב, מה עבר, ומה רלוונטי עכשיו.',
                'לפגישות: השתמש רק ב-today.upcomingEvents ו-upcomingClientMeetings לפגישות תפעוליות. אל תציין פגישות מ-today.pastCount כאילו הן עדיין מתוכננות.',
                'אל תציין חופשות, חגים, או אירועי יומן פנימיים (leave/holiday/reminder) כפגישות — הם לא מופיעים בנתונים התפעוליים.',
                'אל תמציא פגישות עתידיות שלא מופיעות ב-upcomingEvents או upcomingClientMeetings.',
                'אם contextNow.period הוא evening או night — אל תדבר על פגישות שכבר עברו היום; התמקד בחתימות, תיקים, וחלוקת עבודה בין מנהלים.',
                'אל תפתח בברכה, אל תכתוב "בוקר טוב", "ערב טוב", "לילה טוב" ואל תפנה בשם.',
                'התחל ישר בתוכן התפעולי (מה דורש תשומת לב עכשיו).',
                'אם אין נושאים דחופים — ציין זאת בקצרה.',
                'טון: מקצועי, רגוע, ממוקד פעולה.',
                'החזר JSON בלבד בפורמט: {"lines":["משפט 1","משפט 2"],"recommendations":["פעולה 1","פעולה 2"]}',
            ].join('\n'),
        },
        {
            role: 'user',
            content: JSON.stringify(facts, null, 2),
        },
    ];
}


const GREETING_PREFIX = /^(?:בוקר טוב|צהריים טובים|ערב טוב|לילה טוב|שלום)(?:[,.!\s]|$)/i;

function sanitizeAiBriefLines(lines, facts = {}) {
    if (!Array.isArray(lines)) return [];

    const managerName = String(facts.managerName || '').trim();
    const firstName = managerName.split(/\s+/)[0] || '';

    return lines
        .map((line) => String(line || '').trim())
        .filter(Boolean)
        .filter((line) => {
            if (GREETING_PREFIX.test(line)) return false;
            if (firstName && line.includes(firstName) && line.length <= firstName.length + 24) {
                return false;
            }
            return true;
        })
        .slice(0, 6);
}

function sanitizeAiBriefRecommendations(recommendations, facts = {}) {
    if (!Array.isArray(recommendations)) return [];

    const managerName = String(facts.managerName || '').trim();
    const firstName = managerName.split(/\s+/)[0] || '';

    return recommendations
        .map((line) => String(line || '').trim())
        .filter(Boolean)
        .filter((line) => {
            if (GREETING_PREFIX.test(line)) return false;
            if (firstName && line.includes(firstName) && line.length <= firstName.length + 24) {
                return false;
            }
            return true;
        })
        .slice(0, 3);
}

function parseLlmBrief(raw) {
    if (!raw || typeof raw !== 'string') return null;

    const trimmed = raw.trim();
    if (trimmed.startsWith('מצטער')) return null;

    try {
        const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed.lines)) {
                const lines = parsed.lines.map((l) => String(l).trim()).filter(Boolean).slice(0, 6);
                const recommendations = Array.isArray(parsed.recommendations)
                    ? parsed.recommendations.map((l) => String(l).trim()).filter(Boolean).slice(0, 3)
                    : [];
                return lines.length ? { lines, recommendations } : null;
            }
        }
    } catch {
        /* fall through to plain-text parsing */
    }

    const lines = trimmed
        .split(/\n+/)
        .map((line) => line.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, '').trim())
        .filter(Boolean)
        .slice(0, 6);

    return lines.length ? { lines, recommendations: [] } : null;
}

function parseLlmLines(raw) {
    const brief = parseLlmBrief(raw);
    return brief?.lines || null;
}

function collectFactNumbers(facts) {
    return [
        facts.summary?.urgentCount,
        facts.summary?.needsAttentionCount,
        facts.summary?.attentionQueueCount,
        facts.summary?.unassignedCases,
        facts.summary?.noActivityCases,
        facts.summary?.signingExpired,
        facts.summary?.signingExpiring,
        facts.summary?.signingPending,
        facts.today?.count,
        facts.today?.potentialClientCount,
        facts.today?.upcomingCount,
        facts.summary?.potentialClientMeetings,
        facts.insights?.signingPressure?.pending,
        facts.insights?.signingPressure?.expired,
        facts.insights?.signingPressure?.expiring,
        facts.insights?.inactivityBurden?.noActivityCases,
        facts.insights?.dayMomentum?.casesOpenedToday,
        facts.insights?.dayMomentum?.casesClosedToday,
        facts.insights?.urgentBreakdown?.total,
    ]
        .filter((n) => n != null && Number(n) > 0)
        .map(String);
}

function collectFactNames(facts) {
    const caseNames = (facts.topAttention || [])
        .map((item) => item.caseName)
        .filter(Boolean);

    const managerNames = [
        ...(facts.workload || []).map((item) => item.managerName),
        ...(facts.insights?.workloadHotspots || []).map((item) => item.managerName),
    ].filter(Boolean);

    return { caseNames, managerNames };
}

function lineMatchesFacts(line, facts) {
    const numbers = collectFactNumbers(facts);
    const { caseNames, managerNames } = collectFactNames(facts);

    if (numbers.some((n) => line.includes(n))) return true;
    if (caseNames.some((name) => line.includes(name))) return true;
    if (managerNames.some((name) => line.includes(name))) return true;

    const keywords = [
        'חתימ',
        'תיק',
        'פגיש',
        'פעילות',
        'לא משויך',
        'דחוף',
        'פג תוקף',
        'רישיון',
        'לקוח',
        'שקט',
        'אין',
        'מנהל',
        'טיפול',
        'עומס',
    ];
    return keywords.some((kw) => line.includes(kw));
}

function validateLinesAgainstFacts(lines, facts) {
    if (!Array.isArray(lines) || lines.length === 0) return false;
    return lines.some((line) => lineMatchesFacts(line, facts));
}

function validateRecommendationsAgainstFacts(recommendations, facts) {
    if (!Array.isArray(recommendations) || recommendations.length === 0) return true;
    return recommendations.every((line) => lineMatchesFacts(line, facts));
}

function aiBriefTimeBucket(contextNow) {
    return `${contextNow?.date || 'unknown'}:${String(contextNow?.hour ?? 0).padStart(2, '0')}`;
}

async function generateAiMorningBrief({
    userId,
    payload,
    callLlmFn,
    getSettingFn,
    isPlatformAdminFn,
    now,
} = {}) {
    const enabled = await isAiBriefEnabled({ getSettingFn, userId, isPlatformAdminFn });
    if (!enabled) return null;

    const referenceNow = now instanceof Date ? now : new Date();
    const facts = buildFactsSnapshot(payload, { now: referenceNow });
    const fingerprint = factsFingerprint(facts);
    const timeBucket = aiBriefTimeBucket(facts.contextNow);
    const cacheKey = `managerHomeAiBrief:${userId || 'admin'}:${fingerprint}:${timeBucket}`;

    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached;

    const llm = callLlmFn || defaultBriefLlmCall;
    const raw = await llm(buildPrompt(facts));
    const parsed = parseLlmBrief(raw);
    const lines = sanitizeAiBriefLines(parsed?.lines, facts);
    const recommendations = sanitizeAiBriefRecommendations(parsed?.recommendations, facts);
    if (!lines?.length || !validateLinesAgainstFacts(lines, facts)) {
        console.warn('[aiBrief] generation failed or did not pass fact validation');
        return null;
    }
    if (!validateRecommendationsAgainstFacts(recommendations, facts)) {
        console.warn('[aiBrief] recommendations failed fact validation — dropping them');
    }

    const result = {
        source: 'ai',
        lines,
        recommendations: validateRecommendationsAgainstFacts(recommendations, facts)
            ? recommendations
            : [],
        generatedAt: new Date().toISOString(),
    };
    cache.set(cacheKey, result, { ttlMs: C.AI_BRIEF_CACHE_TTL_MS });
    return result;
}

function invalidateAiBriefCache() {
    cache.deleteByPrefix('managerHomeAiBrief:');
}

function __testReset() {
    cache.clear();
}

module.exports = {
    isAiBriefEnabled,
    buildFactsSnapshot,
    buildContextNow,
    isOperationalCalendarEvent,
    generateAiMorningBrief,
    invalidateAiBriefCache,
    parseLlmBrief,
    parseLlmLines,
    sanitizeAiBriefLines,
    sanitizeAiBriefRecommendations,
    validateLinesAgainstFacts,
    validateRecommendationsAgainstFacts,
    factsFingerprint,
    aiBriefTimeBucket,
    __testReset,
};
