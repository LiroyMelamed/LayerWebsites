const { flattenAttentionItems } = require('./scoring');

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

function buildSigningPressure(summary = {}) {
    const pending = summary.signingPending || 0;
    const expiring = summary.signingExpiring || 0;
    const expired = summary.signingExpired || 0;
    const rejected = summary.signingRejected || 0;
    const totalRisk = expired + expiring + rejected;
    const isTopRisk = totalRisk > 0 || pending >= 5;

    return {
        pending,
        expiring,
        expired,
        rejected,
        totalRisk,
        isTopRisk,
    };
}

function buildWorkloadHotspots(managerWorkload = []) {
    return [...managerWorkload]
        .filter((m) => m.activeCases > 0 || m.needsAttention > 0)
        .map((m) => {
            const attentionRatio = m.activeCases > 0
                ? Math.round((m.needsAttention / m.activeCases) * 100)
                : m.needsAttention;
            const attentionSummaryHe = m.activeCases > 0
                ? `מתוך ${m.activeCases} תיקים פתוחים, ${m.needsAttention} (${attentionRatio}%) מסומנים כדורשים טיפול`
                : `${m.needsAttention} פריטים דורשים טיפול`;

            return {
                managerName: m.managerName,
                activeCases: m.activeCases,
                needsAttention: m.needsAttention,
                urgentCases: m.urgentCases,
                attentionRatio,
                attentionSummaryHe,
            };
        })
        .sort((a, b) => b.needsAttention - a.needsAttention || b.attentionRatio - a.attentionRatio)
        .slice(0, 3);
}

function buildInactivityBurden(summary = {}, firmStats = {}) {
    const noActivityCases = summary.noActivityCases || 0;
    const openCases = firmStats.openCases || 0;
    const ratio = openCases > 0 ? Math.round((noActivityCases / openCases) * 100) : 0;

    return {
        noActivityCases,
        attentionQueueCount: summary.attentionRawCount || 0,
        openCases,
        ratioPercent: ratio,
        isElevated: ratio >= 20 && noActivityCases >= 5,
    };
}

function buildDayMomentum(firmStats = {}) {
    const opened = firmStats.casesOpenedToday || 0;
    const closed = firmStats.casesClosedToday || 0;

    let trend = 'balanced';
    if (opened > closed + 1) trend = 'opening';
    else if (closed > opened + 1) trend = 'closing';

    return {
        casesOpenedToday: opened,
        casesClosedToday: closed,
        trend,
    };
}

function buildFocusAreas(attentionItems = []) {
    const flat = flattenAttentionItems(attentionItems);
    const buckets = new Map();

    for (const item of flat) {
        const type = item.signalType || 'unknown';
        if (!buckets.has(type)) {
            buckets.set(type, { signalType: type, count: 0, bestPriority: item.priority });
        }
        const bucket = buckets.get(type);
        bucket.count += 1;
        if (PRIORITY_RANK[item.priority] < PRIORITY_RANK[bucket.bestPriority]) {
            bucket.bestPriority = item.priority;
        }
    }

    return [...buckets.values()]
        .sort((a, b) => {
            const pr = PRIORITY_RANK[a.bestPriority] - PRIORITY_RANK[b.bestPriority];
            if (pr !== 0) return pr;
            return b.count - a.count;
        })
        .slice(0, 3);
}

function buildUrgentBreakdown(attentionItems = []) {
    const flat = flattenAttentionItems(attentionItems);
    const urgent = flat.filter((i) => i.priority === 'critical' || i.priority === 'high');
    const byType = new Map();

    for (const item of urgent) {
        const type = item.signalType || 'unknown';
        byType.set(type, (byType.get(type) || 0) + 1);
    }

    return {
        total: urgent.length,
        bySignalType: Object.fromEntries(byType.entries()),
    };
}

function buildOperationalInsights(payload = {}) {
    const summary = payload.summary || {};
    const firmStats = payload.firmStats || {};

    return {
        signingPressure: buildSigningPressure(summary),
        workloadHotspots: buildWorkloadHotspots(payload.managerWorkload || []),
        inactivityBurden: buildInactivityBurden(summary, firmStats),
        dayMomentum: buildDayMomentum(firmStats),
        focusAreas: buildFocusAreas(payload.attentionItems || []),
        urgentBreakdown: buildUrgentBreakdown(payload.attentionItems || []),
    };
}

module.exports = {
    buildOperationalInsights,
    buildSigningPressure,
    buildWorkloadHotspots,
    buildInactivityBurden,
    buildDayMomentum,
    buildFocusAreas,
    buildUrgentBreakdown,
};
