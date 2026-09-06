const crypto = require('crypto');
const { flattenAttentionItems } = require('./scoring');
const C = require('./constants');
const { MemoryCache } = require('../../utils/memoryCache');

const cache = new MemoryCache({ name: 'managerHomeAiBrief', maxEntries: 20 });

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const TIER_RANK = { hard: 0, soft: 1 };

async function isAiBriefEnabled({ getSettingFn } = {}) {
    const getSetting = getSettingFn || require('../settingsService').getSetting;
    const flag = await getSetting('managerHome', 'MANAGER_HOME_AI_INSIGHTS_ENABLED', false);
    const apiKey = process.env.CHATBOT_LLM_API_KEY || '';
    return Boolean(flag) && Boolean(apiKey);
}

function buildFactsSnapshot(payload) {
    const summary = payload?.summary || {};
    const flat = flattenAttentionItems(payload?.attentionItems || []);
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
        .map((m) => ({
            managerName: m.managerName,
            activeCases: m.activeCases,
            needsAttention: m.needsAttention,
            urgentCases: m.urgentCases,
            unassigned: m.unassigned,
        }));

    const today = payload?.today || [];
    const todayPotential = today.filter((e) => e.isPotentialClient).length;

    return {
        managerName: payload?.greeting?.managerName || null,
        summary: {
            urgentCount: summary.urgentCount || 0,
            needsAttentionCount: summary.needsAttentionCount || 0,
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
            count: today.length,
            potentialClientCount: todayPotential,
        },
    };
}

function factsFingerprint(facts) {
    return crypto.createHash('sha256').update(JSON.stringify(facts)).digest('hex').slice(0, 16);
}

function buildPrompt(facts) {
    return [
        {
            role: 'system',
            content: [
                'אתה אנalist תפעולי למשרד עורכי דין.',
                'קיבלת JSON עם נתונים תפעוליים בלבד מהמערכת.',
                'כתוב 2-4 משפטים קצרים בעברית לסיכום בוקר למנהל/ת המשרד.',
                'חובה: השתמש רק בנתונים שסופקו. אל תמציא מספרים, שמות תיקים, מועדים או מסקנות.',
                'אם אין נושאים דחופים — ציין זאת בקצרה.',
                'טון: מקצועי, רגוע, ממוקד פעולה.',
                'החזר JSON בלבד בפורמט: {"lines":["משפט 1","משפט 2"]}',
            ].join('\n'),
        },
        {
            role: 'user',
            content: JSON.stringify(facts, null, 2),
        },
    ];
}

function parseLlmLines(raw) {
    if (!raw || typeof raw !== 'string') return null;

    const trimmed = raw.trim();
    if (trimmed.startsWith('מצטער')) return null;

    try {
        const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed.lines)) {
                const lines = parsed.lines.map((l) => String(l).trim()).filter(Boolean).slice(0, 4);
                return lines.length ? lines : null;
            }
        }
    } catch {
        /* fall through to plain-text parsing */
    }

    const lines = trimmed
        .split(/\n+/)
        .map((line) => line.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, '').trim())
        .filter(Boolean)
        .slice(0, 4);

    return lines.length ? lines : null;
}

function validateLinesAgainstFacts(lines, facts) {
    if (!Array.isArray(lines) || lines.length === 0) return false;

    const numbers = [
        facts.summary?.urgentCount,
        facts.summary?.needsAttentionCount,
        facts.summary?.unassignedCases,
        facts.summary?.noActivityCases,
        facts.summary?.signingExpired,
        facts.summary?.signingExpiring,
        facts.summary?.signingPending,
        facts.today?.count,
        facts.today?.potentialClientCount,
        facts.summary?.potentialClientMeetings,
    ]
        .filter((n) => n != null && Number(n) > 0)
        .map(String);

    const caseNames = (facts.topAttention || [])
        .map((item) => item.caseName)
        .filter(Boolean);

    const managerNames = (facts.workload || [])
        .map((item) => item.managerName)
        .filter(Boolean);

    return lines.some((line) => {
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
        ];
        return keywords.some((kw) => line.includes(kw));
    });
}

async function generateAiMorningBrief({ userId, payload, callLlmFn, getSettingFn } = {}) {
    const enabled = await isAiBriefEnabled({ getSettingFn });
    if (!enabled) return null;

    const facts = buildFactsSnapshot(payload);
    const fingerprint = factsFingerprint(facts);
    const cacheKey = `managerHomeAiBrief:${userId || 'admin'}:${fingerprint}`;

    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached;

    const llm = callLlmFn || require('../aiChatService').callLLM;
    const raw = await llm(buildPrompt(facts));
    const lines = parseLlmLines(raw);
    if (!lines?.length || !validateLinesAgainstFacts(lines, facts)) {
        console.warn('[aiBrief] generation failed or did not pass fact validation');
        return null;
    }

    const result = {
        source: 'ai',
        lines,
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
    generateAiMorningBrief,
    invalidateAiBriefCache,
    parseLlmLines,
    validateLinesAgainstFacts,
    factsFingerprint,
    __testReset,
};
