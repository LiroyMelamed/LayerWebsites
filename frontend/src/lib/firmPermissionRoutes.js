import {
    AdminSupportScreenName,
    AllCasesScreenName,
    AllCasesTypeScreenName,
    AllClientsScreenName,
    CalendarScreenName,
    MainScreenName,
    MyCasesScreenName,
    RemindersScreenName,
    SigningManagerScreenName,
    TaggedCasesScreenName,
    uploadFileForSigningScreenName,
} from "../navigation/screenPaths";
import { AdminStackName } from "../navigation/AdminStack";

/** Preferred landing order when redirecting Staff away from a forbidden page. */
export const STAFF_LANDING_NAV_ORDER = Object.freeze([
    "main",
    "allCases",
    "taggedCases",
    "myCases",
    "allCaseTypes",
    "allClients",
    "signingFiles",
    "uploadFileForSigning",
    "reminders",
    "calendar",
    "support",
]);

export const NAV_KEY_TO_ADMIN_PATH = Object.freeze({
    main: `${AdminStackName}${MainScreenName}`,
    allCases: `${AdminStackName}${AllCasesScreenName}`,
    taggedCases: `${AdminStackName}${TaggedCasesScreenName}`,
    myCases: `${AdminStackName}${MyCasesScreenName}`,
    allCaseTypes: `${AdminStackName}${AllCasesTypeScreenName}`,
    allClients: `${AdminStackName}${AllClientsScreenName}`,
    signingFiles: `${AdminStackName}${SigningManagerScreenName}`,
    uploadFileForSigning: `${AdminStackName}${uploadFileForSigningScreenName}`,
    reminders: `${AdminStackName}${RemindersScreenName}`,
    calendar: `${AdminStackName}${CalendarScreenName}`,
    support: `${AdminStackName}${AdminSupportScreenName}`,
});

export function firstAllowedStaffPath(pages) {
    if (!Array.isArray(pages) || pages.length === 0) return null;
    for (const navKey of STAFF_LANDING_NAV_ORDER) {
        if (pages.includes(navKey)) {
            const path = NAV_KEY_TO_ADMIN_PATH[navKey];
            if (path) return path;
        }
    }
    return null;
}
