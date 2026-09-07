import { AdminStackName, AllCasesScreenName, CalendarScreenName, SigningManagerScreenName } from "../../../../navigation/screenPaths";

export function navigateAttentionItem(navigate, item) {
    if (!item) return;
    const route = item.actionRoute;
    const params = item.actionParams || {};

    if (route === "case" && params.caseId) {
        navigate(`${AdminStackName}${AllCasesScreenName}?caseId=${params.caseId}`);
        return;
    }
    if (route === "signing") {
        navigate(`${AdminStackName}${SigningManagerScreenName}`);
        return;
    }
    if (route === "calendar") {
        navigate(`${AdminStackName}${CalendarScreenName}`);
        return;
    }
    if (route === "reminders") {
        navigate(`${AdminStackName}/RemindersScreen`);
    }
}

export function priorityClassName(priority) {
    return `is-${priority || "medium"}`;
}
