/** Maps AdminStack route segments to permission page keys (session-scope). */
export const ROUTE_SEGMENT_TO_NAV_KEY = Object.freeze({
    MainScreen: "main",
    TaggedCasesScreen: "taggedCases",
    AllCasesScreen: "allCases",
    AllClientsScreen: "allClients",
    AllCasesType: "allCaseTypes",
    SigningManagerScreen: "signingFiles",
    SigningSpotsPreview: "signingFiles",
    UploadFileForSigningScreen: "uploadFileForSigning",
    RemindersScreen: "reminders",
    CalendarScreen: "calendar",
    "calendar/day": "calendar",
    MyCases: "myCases",
    support: "support",
    AllManger: "allManagers",
    FirmStaffRoles: "firmStaffRoles",
    NoPermissions: "noPermissions",
});

export function navKeyForPathname(pathname) {
    const p = String(pathname || "");
    for (const [segment, navKey] of Object.entries(ROUTE_SEGMENT_TO_NAV_KEY)) {
        if (p.includes(segment)) return navKey;
    }
    return null;
}
