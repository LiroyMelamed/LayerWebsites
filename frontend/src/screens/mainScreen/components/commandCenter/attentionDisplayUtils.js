const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

export const SIGNING_SIGNAL_TYPES = new Set([
    "signing_pending",
    "signing_expired",
    "signing_expiring",
    "signing_rejected",
]);

export const CASE_SIGNAL_TYPES = new Set([
    "unassigned_case",
    "license_expired",
    "license_expiring_critical",
    "license_expiring_warning",
    "completion_passed",
    "completion_approaching",
    "no_activity",
    "long_in_stage",
]);

export const CALENDAR_SIGNAL_TYPES = new Set(["rsvp_pending"]);

function resolveManagerSectionKey(item, { unassignedLabel, signingLabel }) {
    const managerName = String(item.managerName || "").trim();
    if (managerName) return managerName;
    if (item.entityType === "signing" || SIGNING_SIGNAL_TYPES.has(item.signalType)) {
        return signingLabel;
    }
    return unassignedLabel;
}

function flattenAttentionItems(items = []) {
    const out = [];
    for (const item of items) {
        if (item?.kind === "group" && Array.isArray(item.members)) {
            out.push(...item.members);
        } else {
            out.push(item);
        }
    }
    return out;
}

function sortItems(items) {
    return [...items].sort((a, b) => {
        const pr = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
        if (pr !== 0) return pr;
        return String(a.caseName || "").localeCompare(String(b.caseName || ""), "he");
    });
}

export function enrichAttentionMember(member) {
    const isSigning = member?.entityType === "signing"
        || SIGNING_SIGNAL_TYPES.has(member?.signalType);
    const isCalendar = member?.entityType === "calendar"
        || member?.actionRoute === "calendar"
        || CALENDAR_SIGNAL_TYPES.has(member?.signalType);
    const isCase = member?.entityType === "case"
        || CASE_SIGNAL_TYPES.has(member?.signalType);

    const caseId = member?.caseId
        || member?.actionParams?.caseId
        || (isCase ? member?.entityId : null);
    const signingFileId = member?.actionParams?.signingFileId
        || (isSigning ? member?.entityId : null);
    const eventId = member?.actionParams?.eventId
        || (isCalendar ? member?.entityId : null);

    const actionRoute = member?.actionRoute
        || (isSigning ? "signing" : isCalendar ? "calendar" : caseId ? "case" : member?.actionRoute);

    return {
        ...member,
        entityType: member?.entityType
            || (isSigning ? "signing" : isCalendar ? "calendar" : isCase ? "case" : member?.entityType),
        caseId: caseId ?? member?.caseId,
        caseName: member?.caseName || member?.reasonParams?.caseName || member?.subtitle || null,
        actionRoute,
        actionParams: {
            ...(member?.actionParams || {}),
            ...(caseId ? { caseId } : {}),
            ...(signingFileId ? { signingFileId } : {}),
            ...(eventId ? { eventId } : {}),
        },
    };
}

function buildNoActivityGroupParams(members) {
    const dayValues = members
        .map((member) => Number(member.reasonParams?.days))
        .filter((days) => Number.isFinite(days) && days > 0);

    if (!dayValues.length) {
        return { days: 7, minDays: 7, maxDays: 7 };
    }

    const minDays = Math.min(...dayValues);
    const maxDays = Math.max(...dayValues);
    return { days: minDays, minDays, maxDays };
}

function buildSignalGroup(signalType, members) {
    if (members.length <= 1) {
        return { ...members[0], kind: "single" };
    }
    const topPriority = members.reduce(
        (best, member) => (
            (PRIORITY_RANK[member.priority] ?? 2) < (PRIORITY_RANK[best] ?? 2)
                ? member.priority
                : best
        ),
        members[0].priority,
    );

    const reasonParams = { count: members.length };
    let titleKey = `managerHome.groups.${signalType}`;

    if (signalType === "no_activity") {
        const dayParams = buildNoActivityGroupParams(members);
        Object.assign(reasonParams, dayParams);
        titleKey = dayParams.minDays === dayParams.maxDays
            ? "managerHome.groups.no_activity"
            : "managerHome.groups.no_activity_range";
    }

    return {
        kind: "group",
        signalType,
        signalTier: members[0].signalTier || "soft",
        priority: topPriority,
        count: members.length,
        titleKey,
        reasonKey: `managerHome.groupReasons.${signalType}`,
        reasonParams,
        members,
        actionRoute: members[0].actionRoute,
        actionParams: members[0].actionParams,
    };
}

function regroupManagerItems(items) {
    const buckets = new Map();
    for (const item of items) {
        const type = item.signalType || "unknown";
        if (!buckets.has(type)) buckets.set(type, []);
        buckets.get(type).push(enrichAttentionMember({ ...item, kind: "single" }));
    }

    const grouped = [];
    for (const [signalType, members] of buckets.entries()) {
        grouped.push(buildSignalGroup(signalType, members));
    }
    return sortItems(grouped);
}

export function organizeAttentionByManager(
    items = [],
    { unassignedLabel = "ללא מנהל", signingLabel = "חתימות" } = {},
) {
    const flat = flattenAttentionItems(items);
    const byManager = new Map();

    for (const item of flat) {
        const key = resolveManagerSectionKey(item, { unassignedLabel, signingLabel });
        if (!byManager.has(key)) byManager.set(key, []);
        byManager.get(key).push(enrichAttentionMember({ ...item, kind: "single" }));
    }

    return [...byManager.entries()]
        .map(([managerName, managerItems]) => ({
            managerName,
            count: managerItems.length,
            items: regroupManagerItems(managerItems),
        }))
        .sort((a, b) => b.count - a.count || a.managerName.localeCompare(b.managerName, "he"));
}

export function countAttentionQueue(items = []) {
    return flattenAttentionItems(items).length;
}

export function resolveAttentionCaseId(item) {
    return item?.actionParams?.caseId
        || item?.caseId
        || (item?.entityType === "case" ? item?.entityId : null)
        || (CASE_SIGNAL_TYPES.has(item?.signalType) ? item?.entityId : null);
}

export function resolveAttentionCaseName(item) {
    return item?.caseName
        || item?.reasonParams?.caseName
        || item?.subtitle
        || null;
}

export function resolveAttentionEventId(item) {
    return item?.actionParams?.eventId
        || (item?.entityType === "calendar" ? item?.entityId : null)
        || (item?.signalType === "rsvp_pending" ? item?.entityId : null);
}

export function resolveAttentionSigningFileId(item) {
    return item?.actionParams?.signingFileId
        || (item?.entityType === "signing" ? item?.entityId : null);
}

export function isAttentionSigningItem(item) {
    return item?.entityType === "signing"
        || item?.actionRoute === "signing"
        || SIGNING_SIGNAL_TYPES.has(item?.signalType);
}

export function isAttentionCalendarItem(item) {
    return item?.entityType === "calendar"
        || item?.actionRoute === "calendar"
        || CALENDAR_SIGNAL_TYPES.has(item?.signalType);
}
