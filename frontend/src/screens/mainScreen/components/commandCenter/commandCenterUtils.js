import {
    AdminStackName,
    AllCasesScreenName,
    CalendarScreenName,
    RemindersScreenName,
    SigningManagerScreenName,
} from "../../../../navigation/screenPaths";
import { openCalendarEventModal } from "./openCalendarEventModal";
import { openCaseModal } from "./openCaseModal";
import { openCaseMenuModal } from "./openCaseMenuModal";
import { openSigningFileModal } from "./openSigningFileModal";
import { openReminderModal } from "./openReminderModal";


const SIGNING_EXPIRING_MS = 3 * 24 * 60 * 60 * 1000;

function buildPath(screen, query = "") {
    return `${AdminStackName}${screen}${query}`;
}

const SIGNING_SIGNAL_TYPES = new Set([
    "signing_pending",
    "signing_expired",
    "signing_expiring",
    "signing_rejected",
]);

const CASE_SIGNAL_TYPES = new Set([
    "unassigned_case",
    "license_expired",
    "license_expiring_critical",
    "license_expiring_warning",
    "completion_passed",
    "completion_approaching",
    "no_activity",
    "long_in_stage",
]);

function isSigningAttentionItem(item) {
    return item?.entityType === "signing"
        || item?.actionRoute === "signing"
        || SIGNING_SIGNAL_TYPES.has(item?.signalType);
}

function isCalendarAttentionItem(item) {
    return item?.entityType === "calendar"
        || item?.actionRoute === "calendar"
        || item?.signalType === "rsvp_pending";
}

function resolveCaseId(item) {
    return item?.actionParams?.caseId
        || item?.caseId
        || (item?.entityType === "case" ? item?.entityId : null)
        || (CASE_SIGNAL_TYPES.has(item?.signalType) ? item?.entityId : null);
}

function resolveCaseName(item) {
    const direct = item?.caseName || item?.reasonParams?.caseName || item?.subtitle || null;
    if (direct) return direct;
    const label = item?.reasonParams?.filename || null;
    return label;
}

function resolveEventId(item) {
    return item?.actionParams?.eventId
        || (item?.entityType === "calendar" ? item?.entityId : null)
        || (item?.signalType === "rsvp_pending" ? item?.entityId : null);
}

function resolveSigningFileId(item) {
    return item?.actionParams?.signingFileId
        || (item?.entityType === "signing" ? item?.entityId : null);
}

export async function navigateAttentionItem(navigate, item, modalHandlers = {}) {
    if (!item) return;

    const {
        openPopup,
        pushPopup,
        popPopup,
        closePopup,
        onEventSaved,
        onEventDeleted,
        onDataChanged,
    } = modalHandlers;

    const refresh = onDataChanged || onEventSaved;

    const tryOpenCase = async (targetItem) => {
        const caseId = resolveCaseId(targetItem);
        const caseName = resolveCaseName(targetItem);
        if ((!caseId && !caseName) || !(pushPopup || openPopup)) return false;
        return openCaseMenuModal({
            caseId,
            caseName,
            openPopup,
            pushPopup,
            onSaved: refresh,
        });
    };

    const tryOpenSigningFile = async (targetItem) => {
        const signingFileId = resolveSigningFileId(targetItem);
        if (!signingFileId || !(pushPopup || openPopup)) return false;
        return openSigningFileModal({
            signingFileId,
            openPopup,
            pushPopup,
            closePopup,
            onChanged: refresh,
        });
    };

    const tryOpenCalendarEvent = async (targetItem) => {
        const eventId = resolveEventId(targetItem);
        if (!isCalendarAttentionItem(targetItem) || !eventId || !(pushPopup || openPopup)) {
            return false;
        }
        return openCalendarEventModal({
            eventId,
            openPopup,
            pushPopup,
            popPopup,
            closePopup,
            onSaved: refresh,
            onDeleted: refresh,
        });
    };

    const tryOpenReminder = async (targetItem) => {
        const reminderId =
            targetItem?.actionParams?.reminderId
            || (targetItem?.entityType === "reminder" ? targetItem?.entityId : null);
        if (!reminderId || !openPopup || !closePopup) return false;
        return openReminderModal({
            reminderId,
            openPopup,
            closePopup,
            onChanged: refresh,
        });
    };

    const openInPage = async (targetItem) => {
        if (isSigningAttentionItem(targetItem)) {
            if (await tryOpenSigningFile(targetItem)) return true;
        }
        if (isCalendarAttentionItem(targetItem)) {
            if (await tryOpenCalendarEvent(targetItem)) return true;
        }
        if (await tryOpenCase(targetItem)) return true;
        if (!isSigningAttentionItem(targetItem) && await tryOpenSigningFile(targetItem)) return true;
        if (await tryOpenReminder(targetItem)) return true;
        return false;
    };

    if (item.kind === "group") {
        if (item.count === 1 && item.members?.[0]) {
            if (await openInPage(item.members[0])) return;
            await navigateAttentionItem(navigate, item.members[0], modalHandlers);
            return;
        }
        if (item.members?.[0]) {
            if (await openInPage(item.members[0])) return;
        }
        return;
    }

    if (await openInPage(item)) return;

    if (!navigate) return;

    const route = item.actionRoute;
    const params = item.actionParams || {};
    const fallbackCaseId = resolveCaseId(item);

    if (fallbackCaseId) {
        navigate(buildPath(AllCasesScreenName, `?caseId=${fallbackCaseId}`));
        return;
    }

    if (route === "case" && params.caseId) {
        navigate(buildPath(AllCasesScreenName, `?caseId=${params.caseId}`));
        return;
    }
    if (route === "signing") {
        navigate(buildPath(SigningManagerScreenName));
        return;
    }
    if (route === "calendar") {
        const eventId = params.eventId;
        navigate(
            buildPath(
                CalendarScreenName,
                eventId ? `?eventId=${encodeURIComponent(String(eventId))}` : ""
            )
        );
        return;
    }
    if (route === "reminders") {
        navigate(buildPath(RemindersScreenName));
    }
}

export function navigateSigningRow(navigate, row) {
    if (!navigate) return;
    navigate(buildPath(SigningManagerScreenName));
}

export function navigateCaseRow(navigate, caseId, modalHandlers = {}) {
    if (!caseId) return;
    const { openPopup, closePopup, onDataChanged } = modalHandlers;
    if (openPopup && closePopup) {
        openCaseModal({
            caseId,
            openPopup,
            closePopup,
            onSaved: onDataChanged,
        });
        return;
    }
    if (!navigate) return;
    navigate(buildPath(AllCasesScreenName, `?caseId=${caseId}`));
}

export function navigateCalendar(navigate) {
    if (!navigate) return;
    navigate(buildPath(CalendarScreenName));
}

export function navigateOpenCases(navigate, query = "?status=open") {
    if (!navigate) return;
    navigate(buildPath(AllCasesScreenName, query));
}

export function navigateOpenCasesByManager(navigate, manager, viewMode = "open") {
    if (!navigate) return;
    const status = viewMode === "all" ? "all" : viewMode === "closed" ? "closed" : "open";
    if (manager?.unassigned) {
        navigateOpenCases(navigate, `?status=${status}&unassigned=1`);
        return;
    }
    if (manager?.managerName) {
        navigateOpenCases(
            navigate,
            `?status=${status}&manager=${encodeURIComponent(manager.managerName)}`
        );
        return;
    }
    navigateOpenCases(navigate, `?status=${status}`);
}

export function getIsraelGreetingKey(now = new Date()) {
    const hour = Number(
        new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Jerusalem",
            hour: "numeric",
            hour12: false,
        }).format(now)
    );

    if (hour >= 5 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 21) return "evening";
    return "night";
}

export function memberAttentionLabel(member, t) {
    if (!member) return "—";
    const parts = [];
    if (member.caseName) parts.push(member.caseName);
    else if (member.subtitle) parts.push(member.subtitle);
    if (member.clientName) parts.push(member.clientName);
    if (parts.length === 0 && member.reasonParams?.filename) {
        parts.push(member.reasonParams.filename);
    }
    return parts.length ? parts.join(" · ") : t("managerHome.actions.open");
}

export function priorityClassName(priority) {
    return `is-${priority || "medium"}`;
}

export function signalTypeClassName(signalType) {
    if (!signalType) return "";
    return `is-signal-${String(signalType).replace(/_/g, "-")}`;
}

export function resolveSigningQueueState(row, now = new Date()) {
    const status = String(row?.status || "").toLowerCase();
    if (status === "rejected") return "rejected";

    const expiresAt = row?.expiresAt ? new Date(row.expiresAt) : null;
    if (status === "pending" && expiresAt && expiresAt < now) return "expired";
    if (status === "pending" && expiresAt && (expiresAt - now) <= SIGNING_EXPIRING_MS) {
        return "expiring";
    }
    return "pending";
}

export function attentionMetaLine(item, t) {
    if (item.kind === "group") {
        const first = item.members?.[0];
        if (!first) return null;
        const lead = first.caseName || first.subtitle || first.clientName;
        if (item.count > 1 && lead) {
            return t("managerHome.attention.groupMeta", {
                lead,
                count: item.count - 1,
            });
        }
        return lead || null;
    }

    const parts = [];
    if (item.caseName) parts.push(item.caseName);
    if (item.clientName) parts.push(item.clientName);
    if (item.managerName) parts.push(item.managerName);
    return parts.length ? parts.join(" · ") : null;
}
