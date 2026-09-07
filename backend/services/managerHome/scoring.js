const C = require('./constants');
const { SIGNAL_DEFINITIONS, GROUPABLE_SIGNAL_TYPES } = require('./constants');

/** @typedef {'critical'|'high'|'medium'|'low'} PriorityLevel */

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const TIER_RANK = { hard: 0, soft: 1 };

function signalMeta(signalType) {
    return SIGNAL_DEFINITIONS[signalType] || { tier: 'soft', priority: 'medium', groupable: false };
}

function withSignalMeta(item) {
    const meta = signalMeta(item.signalType);
    return {
        ...item,
        kind: 'single',
        signalTier: meta.tier,
        priority: item.priority || meta.priority,
    };
}

/**
 * Build flat attention signals, then group soft repetitive signals.
 */
function buildAttentionItems({
    caseRows = [],
    signingRows = [],
    rsvpRows = [],
    failedReminders = [],
    now = new Date(),
}) {
    const flat = [];
    const today = startOfDay(now);

    for (const row of caseRows) {
        flat.push(...signalsFromCase(row, today, now));
    }
    for (const row of signingRows) {
        flat.push(...signalsFromSigning(row, now));
    }
    for (const row of rsvpRows) {
        const item = signalFromRsvp(row, now);
        if (item) flat.push(item);
    }
    for (const row of failedReminders) {
        flat.push(signalFromFailedReminder(row));
    }

    const enriched = flat.filter(Boolean).map(withSignalMeta);
    return groupAttentionItems(enriched);
}

function signalsFromCase(row, today, now) {
    const out = [];
    const base = caseBaseFields(row);

    if (!row.casemanagerid) {
        out.push({
            ...base,
            signalType: 'unassigned_case',
            titleKey: 'managerHome.signals.unassignedCase',
            reasonKey: 'managerHome.reasons.unassignedCase',
            reasonParams: { caseName: row.casename || '' },
            subtitle: row.casename || null,
        });
    }

    if (row.haslicenseexpiry && row.licenseexpirydate) {
        const expiry = parseDateOnly(row.licenseexpirydate);
        if (expiry) {
            const daysUntil = daysBetween(today, expiry);
            if (daysUntil < 0) {
                out.push({
                    ...base,
                    signalType: 'license_expired',
                    titleKey: 'managerHome.signals.licenseExpired',
                    reasonKey: 'managerHome.reasons.licenseExpired',
                    reasonParams: { date: formatDateHe(expiry), days: Math.abs(daysUntil) },
                    subtitle: row.casename || null,
                    dueAt: expiry.toISOString(),
                });
            } else if (daysUntil <= C.LICENSE_CRITICAL_DAYS) {
                out.push({
                    ...base,
                    signalType: 'license_expiring_critical',
                    titleKey: 'managerHome.signals.licenseExpiringCritical',
                    reasonKey: 'managerHome.reasons.licenseExpiringCritical',
                    reasonParams: { days: daysUntil, date: formatDateHe(expiry) },
                    subtitle: row.casename || null,
                    dueAt: expiry.toISOString(),
                });
            } else if (daysUntil <= C.LICENSE_WARNING_DAYS) {
                out.push({
                    ...base,
                    signalType: 'license_expiring_warning',
                    titleKey: 'managerHome.signals.licenseExpiringWarning',
                    reasonKey: 'managerHome.reasons.licenseExpiringWarning',
                    reasonParams: { days: daysUntil, date: formatDateHe(expiry) },
                    subtitle: row.casename || null,
                    dueAt: expiry.toISOString(),
                });
            }
        }
    }

    if (row.estimatedcompletiondate) {
        const est = parseDateOnly(row.estimatedcompletiondate);
        if (est) {
            const daysUntil = daysBetween(today, est);
            if (daysUntil < 0) {
                out.push({
                    ...base,
                    signalType: 'completion_passed',
                    titleKey: 'managerHome.signals.completionPassed',
                    reasonKey: 'managerHome.reasons.completionPassed',
                    reasonParams: { date: formatDateHe(est) },
                    subtitle: row.casename || null,
                    dueAt: est.toISOString(),
                });
            } else if (daysUntil <= C.COMPLETION_WARNING_DAYS) {
                out.push({
                    ...base,
                    signalType: 'completion_approaching',
                    titleKey: 'managerHome.signals.completionApproaching',
                    reasonKey: 'managerHome.reasons.completionApproaching',
                    reasonParams: { days: daysUntil, date: formatDateHe(est) },
                    subtitle: row.casename || null,
                    dueAt: est.toISOString(),
                });
            }
        }
    }

    const daysSinceActivity = row.days_since_meaningful_activity != null
        ? Number(row.days_since_meaningful_activity)
        : null;
    if (daysSinceActivity != null && daysSinceActivity >= C.NO_ACTIVITY_DAYS) {
        out.push({
            ...base,
            signalType: 'no_activity',
            titleKey: 'managerHome.signals.noActivity',
            reasonKey: 'managerHome.reasons.noActivity',
            reasonParams: { days: daysSinceActivity, caseName: row.casename || '' },
            subtitle: row.casename || null,
        });
    }

    const daysInStage = row.days_in_current_stage != null ? Number(row.days_in_current_stage) : null;
    if (daysInStage != null && daysInStage >= C.LONG_STAGE_DAYS) {
        out.push({
            ...base,
            signalType: 'long_in_stage',
            titleKey: 'managerHome.signals.longInStage',
            reasonKey: 'managerHome.reasons.longInStage',
            reasonParams: { days: daysInStage, stage: row.currentstage, caseName: row.casename || '' },
            subtitle: row.casename || null,
        });
    }

    return out;
}

function signalsFromSigning(row, now) {
    const out = [];
    const base = {
        entityType: 'signing',
        entityId: row.signingfileid,
        caseId: row.caseid,
        caseName: row.casename || null,
        clientName: row.client_name || null,
        managerId: row.casemanagerid || null,
        managerName: row.casemanager || null,
        actionRoute: 'signing',
        actionParams: { signingFileId: row.signingfileid, caseId: row.caseid },
        subtitle: row.filename || null,
    };

    const status = String(row.status || '').toLowerCase();
    const createdAt = row.createdat ? new Date(row.createdat) : null;
    const expiresAt = row.expiresat ? new Date(row.expiresat) : null;
    const pendingDays = createdAt ? Math.floor((now - createdAt) / 86400000) : null;

    if (status === 'rejected') {
        out.push({
            ...base,
            signalType: 'signing_rejected',
            titleKey: 'managerHome.signals.signingRejected',
            reasonKey: 'managerHome.reasons.signingRejected',
            reasonParams: { filename: row.filename || '', caseName: row.casename || '' },
        });
        return out;
    }

    if (status !== 'pending') return out;

    let hasHardSigningSignal = false;

    if (expiresAt && expiresAt < now) {
        hasHardSigningSignal = true;
        out.push({
            ...base,
            signalType: 'signing_expired',
            titleKey: 'managerHome.signals.signingExpired',
            reasonKey: 'managerHome.reasons.signingExpired',
            reasonParams: { filename: row.filename || '', caseName: row.casename || '' },
            dueAt: expiresAt.toISOString(),
        });
    } else if (expiresAt) {
        const hoursUntil = (expiresAt - now) / 3600000;
        if (hoursUntil <= C.SIGNING_EXPIRING_DAYS * 24) {
            hasHardSigningSignal = true;
            out.push({
                ...base,
                signalType: 'signing_expiring',
                titleKey: 'managerHome.signals.signingExpiring',
                reasonKey: 'managerHome.reasons.signingExpiring',
                reasonParams: {
                    filename: row.filename || '',
                    hours: Math.max(1, Math.ceil(hoursUntil)),
                    caseName: row.casename || '',
                },
                dueAt: expiresAt.toISOString(),
            });
        }
    }

    // Avoid duplicate noise: pending age is soft and skipped when expired/expiring already surfaced
    if (!hasHardSigningSignal && pendingDays != null && pendingDays >= C.SIGNING_PENDING_WARNING_DAYS) {
        out.push({
            ...base,
            signalType: 'signing_pending',
            titleKey: 'managerHome.signals.signingPending',
            reasonKey: 'managerHome.reasons.signingPending',
            reasonParams: {
                filename: row.filename || '',
                days: pendingDays,
                caseName: row.casename || '',
                clientName: row.client_name || '',
            },
        });
    }

    return out;
}

function signalFromRsvp(row, now) {
    const startTime = row.start_time ? new Date(row.start_time) : null;
    const hoursUntil = startTime ? (startTime - now) / 3600000 : null;
    const priority = hoursUntil != null && hoursUntil <= C.RSVP_URGENT_HOURS ? 'high' : 'medium';

    return {
        entityType: 'calendar',
        entityId: row.id,
        caseId: row.case_id || null,
        caseName: row.case_name || row.lead_case_name || null,
        clientName: row.client_name || row.lead_name || null,
        managerId: row.manager_user_id || null,
        managerName: row.manager_name || null,
        signalType: 'rsvp_pending',
        priority,
        titleKey: 'managerHome.signals.rsvpPending',
        reasonKey: 'managerHome.reasons.rsvpPending',
        reasonParams: {
            title: row.title || '',
            when: startTime ? formatDateTimeHe(startTime) : '',
        },
        subtitle: row.title || null,
        dueAt: startTime ? startTime.toISOString() : null,
        actionRoute: 'calendar',
        actionParams: { eventId: row.id },
    };
}

function signalFromFailedReminder(row) {
    return {
        entityType: row.entity_type,
        entityId: row.entity_id,
        caseId: row.case_id || null,
        caseName: row.case_name || null,
        clientName: row.client_name || null,
        managerId: null,
        managerName: null,
        signalType: 'reminder_failed',
        titleKey: 'managerHome.signals.reminderFailed',
        reasonKey: 'managerHome.reasons.reminderFailed',
        reasonParams: { label: row.label || '' },
        subtitle: row.label || null,
        actionRoute: row.action_route || 'reminders',
        actionParams: {},
    };
}

function caseBaseFields(row) {
    return {
        entityType: 'case',
        entityId: row.caseid,
        caseId: row.caseid,
        caseName: row.casename || null,
        clientName: row.client_name || null,
        managerId: row.casemanagerid || null,
        managerName: row.casemanager || null,
        actionRoute: 'case',
        actionParams: { caseId: row.caseid },
    };
}

/**
 * Collapse repetitive soft signals; keep hard signals individual.
 */
function groupAttentionItems(items) {
    const sorted = sortAttentionItems(items);
    const hardSingles = [];
    const groupBuckets = new Map();
    const softSingles = [];

    for (const item of sorted) {
        if (item.signalTier === 'hard' || !GROUPABLE_SIGNAL_TYPES.has(item.signalType)) {
            hardSingles.push({ ...item, kind: 'single' });
            continue;
        }
        if (!groupBuckets.has(item.signalType)) groupBuckets.set(item.signalType, []);
        groupBuckets.get(item.signalType).push(item);
    }

    const grouped = [];
    for (const [signalType, members] of groupBuckets.entries()) {
        if (members.length === 1) {
            softSingles.push({ ...members[0], kind: 'single' });
            continue;
        }
        const topPriority = members.reduce(
            (best, m) => (PRIORITY_RANK[m.priority] < PRIORITY_RANK[best] ? m.priority : best),
            members[0].priority
        );
        grouped.push({
            kind: 'group',
            signalType,
            signalTier: 'soft',
            priority: topPriority,
            count: members.length,
            titleKey: `managerHome.groups.${signalType}`,
            reasonKey: `managerHome.groupReasons.${signalType}`,
            reasonParams: { count: members.length },
            samples: members.slice(0, 3).map((m) => ({
                caseId: m.caseId,
                caseName: m.caseName,
                clientName: m.clientName,
                managerName: m.managerName,
                subtitle: m.subtitle,
                reasonParams: m.reasonParams,
                actionRoute: m.actionRoute,
                actionParams: m.actionParams,
                entityType: m.entityType,
                entityId: m.entityId,
            })),
            members,
            actionRoute: members[0].actionRoute,
            actionParams: members[0].actionParams,
        });
    }

    const combined = sortAttentionItems([...hardSingles, ...grouped, ...softSingles]);
    return combined.slice(0, C.ATTENTION_DISPLAY_LIMIT);
}

function flattenAttentionItems(items) {
    const out = [];
    for (const item of items || []) {
        if (item.kind === 'group') out.push(...item.members);
        else out.push(item);
    }
    return out;
}

function deriveCaseHealth(attentionCount, hasCritical) {
    if (hasCritical || attentionCount >= 2) return 'at_risk';
    if (attentionCount >= 1) return 'needs_attention';
    return 'healthy';
}

/**
 * Deterministic narrative brief from top signals + today's calendar context.
 */
function buildMorningBrief({ attentionItems = [], today = [], potentialClients = [] }) {
    const flat = flattenAttentionItems(attentionItems);
    const hardItems = flat.filter((i) => i.signalTier === 'hard');
    const topItems = (hardItems.length ? hardItems : flat).slice(0, 2);

    const todayPotential = (today || []).filter((e) => e.isPotentialClient).length;
    const sentences = topItems.map((item) => ({
        key: `managerHome.brief.items.${item.signalType}`,
        params: {
            ...(item.reasonParams || {}),
            caseName: item.caseName || item.subtitle || '',
            managerName: item.managerName || '',
        },
    }));

    if (sentences.length === 0 && flat.length === 0) {
        if ((today || []).length > 0) {
            return {
                key: 'managerHome.brief.calmWithToday',
                params: { todayCount: today.length, potentialCount: todayPotential },
            };
        }
        return { key: 'managerHome.brief.allClear', params: {} };
    }

    return {
        sentences,
        todayNote: (today || []).length > 0
            ? {
                key: todayPotential > 0
                    ? 'managerHome.brief.todayNoteWithPotential'
                    : 'managerHome.brief.todayNote',
                params: {
                    todayCount: today.length,
                    potentialCount: todayPotential,
                    upcomingPotential: potentialClients.length,
                },
            }
            : null,
    };
}

function summarizeAttention(attentionItems, caseRows, signingSummary) {
    const flat = flattenAttentionItems(attentionItems);
    const urgentCount = flat.filter((i) => i.priority === 'critical').length;
    const needsAttentionCount = flat.filter((i) =>
        i.priority === 'critical' || i.priority === 'high'
    ).length;

    return {
        urgentCount,
        needsAttentionCount,
        attentionTotal: attentionItems.length,
        attentionRawCount: flat.length,
        unassignedCases: caseRows.filter((r) => !r.casemanagerid).length,
        noActivityCases: caseRows.filter((r) =>
            r.days_since_meaningful_activity != null
            && Number(r.days_since_meaningful_activity) >= C.NO_ACTIVITY_DAYS
        ).length,
        signingPending: signingSummary.pending || 0,
        signingExpiring: signingSummary.expiring || 0,
        signingExpired: signingSummary.expired || 0,
        signingRejected: signingSummary.rejected || 0,
        potentialClientMeetings: 0,
        todayEventCount: 0,
    };
}

function sortAttentionItems(items) {
    return [...items].sort((a, b) => {
        const tierA = TIER_RANK[a.signalTier || signalMeta(a.signalType).tier];
        const tierB = TIER_RANK[b.signalTier || signalMeta(b.signalType).tier];
        if (tierA !== tierB) return tierA - tierB;

        const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        if (pr !== 0) return pr;

        if (a.dueAt && b.dueAt) return new Date(a.dueAt) - new Date(b.dueAt);
        if (a.dueAt) return -1;
        if (b.dueAt) return 1;
        return 0;
    });
}

function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDateOnly(value) {
    if (!value) return null;
    if (value instanceof Date) return startOfDay(value);
    const s = String(value).slice(0, 10);
    const [y, m, day] = s.split('-').map(Number);
    if (!y || !m || !day) return null;
    return new Date(y, m - 1, day);
}

function daysBetween(from, to) {
    return Math.round((to - from) / 86400000);
}

function formatDateHe(d) {
    try {
        return new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
    } catch {
        return String(d).slice(0, 10);
    }
}

function formatDateTimeHe(d) {
    try {
        return new Intl.DateTimeFormat('he-IL', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Jerusalem',
        }).format(d);
    } catch {
        return d.toISOString();
    }
}

module.exports = {
    buildAttentionItems,
    buildMorningBrief,
    deriveCaseHealth,
    summarizeAttention,
    sortAttentionItems,
    groupAttentionItems,
    flattenAttentionItems,
    signalMeta,
    PRIORITY_RANK,
    TIER_RANK,
};
