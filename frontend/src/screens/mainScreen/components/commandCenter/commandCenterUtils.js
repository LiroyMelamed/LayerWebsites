import {
    AdminStackName,
    AllCasesScreenName,
    CalendarScreenName,
    RemindersScreenName,
    SigningManagerScreenName,
} from "../../../../navigation/screenPaths";
import { openCalendarEventModal } from "./openCalendarEventModal";

const GROUP_LIST_ROUTES = {
    signing_pending: SigningManagerScreenName,
    no_activity: AllCasesScreenName,
    long_in_stage: AllCasesScreenName,
    completion_approaching: AllCasesScreenName,
    completion_passed: AllCasesScreenName,
    rsvp_pending: CalendarScreenName,
};

const SIGNING_EXPIRING_MS = 3 * 24 * 60 * 60 * 1000;

function buildPath(screen, query = "") {
    return `${AdminStackName}${screen}${query}`;
}

export async function navigateAttentionItem(navigate, item, modalHandlers = {}) {
    if (!item || !navigate) return;

    const { openPopup, closePopup, onEventSaved, onEventDeleted } = modalHandlers;

    const tryOpenCalendarEvent = async (targetItem) => {
        const eventId = targetItem?.actionParams?.eventId;
        if (targetItem?.actionRoute !== "calendar" || !eventId || !openPopup || !closePopup) {
            return false;
        }
        return openCalendarEventModal({
            eventId,
            openPopup,
            closePopup,
            onSaved: onEventSaved,
            onDeleted: onEventDeleted,
        });
    };

    if (item.kind === "group") {
        if (item.count === 1 && item.members?.[0]) {
            if (await tryOpenCalendarEvent(item.members[0])) return;
            await navigateAttentionItem(navigate, item.members[0], modalHandlers);
            return;
        }
        const listRoute = GROUP_LIST_ROUTES[item.signalType];
        if (listRoute === AllCasesScreenName) {
            navigate(buildPath(AllCasesScreenName, "?status=open"));
            return;
        }
        if (listRoute) {
            navigate(buildPath(listRoute));
            return;
        }
        if (item.members?.[0]) {
            if (await tryOpenCalendarEvent(item.members[0])) return;
            await navigateAttentionItem(navigate, item.members[0], modalHandlers);
        }
        return;
    }

    const route = item.actionRoute;
    const params = item.actionParams || {};

    if (route === "case" && params.caseId) {
        navigate(buildPath(AllCasesScreenName, `?caseId=${params.caseId}`));
        return;
    }
    if (route === "signing") {
        navigate(buildPath(SigningManagerScreenName));
        return;
    }
    if (route === "calendar") {
        if (await tryOpenCalendarEvent(item)) return;
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

export function navigateCaseRow(navigate, caseId) {
    if (!navigate || !caseId) return;
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

export function navigateOpenCasesByManager(navigate, manager) {
    if (!navigate) return;
    if (manager?.unassigned) {
        navigateOpenCases(navigate, "?status=open&unassigned=1");
        return;
    }
    if (manager?.managerName) {
        navigateOpenCases(
            navigate,
            `?status=open&manager=${encodeURIComponent(manager.managerName)}`
        );
        return;
    }
    navigateOpenCases(navigate);
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
