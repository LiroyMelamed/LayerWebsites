import {
    AdminStackName,
    AllCasesScreenName,
    CalendarScreenName,
    RemindersScreenName,
    SigningManagerScreenName,
} from "../../../../navigation/screenPaths";

const GROUP_LIST_ROUTES = {
    signing_pending: SigningManagerScreenName,
    no_activity: AllCasesScreenName,
    long_in_stage: AllCasesScreenName,
    completion_approaching: AllCasesScreenName,
    completion_passed: AllCasesScreenName,
    rsvp_pending: CalendarScreenName,
};

function buildPath(screen, query = "") {
    return `${AdminStackName}${screen}${query}`;
}

export function navigateAttentionItem(navigate, item) {
    if (!item || !navigate) return;

    if (item.kind === "group") {
        if (item.count === 1 && item.members?.[0]) {
            navigateAttentionItem(navigate, item.members[0]);
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
            navigateAttentionItem(navigate, item.members[0]);
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
        navigate(buildPath(CalendarScreenName));
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

export function priorityClassName(priority) {
    return `is-${priority || "medium"}`;
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
