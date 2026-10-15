import CaseFullView from "../../styledComponents/cases/CaseFullView";
import { AdminStackName } from "../../../navigation/AdminStack";
import {
    AllCasesScreenName,
    AllCasesTypeScreenName,
    AllClientsScreenName,
    AllMangerScreenName,
    CalendarScreenName,
    EvidenceDocumentsScreenName,
    FirmStaffRolesScreenName,
    PlanUsageScreenName,
    PlansPricingScreenName,
    PlatformSettingsScreenName,
    RemindersScreenName,
    AdminSupportScreenName,
    SigningManagerScreenName,
    uploadFileForSigningScreenName,
} from "../../../navigation/screenPaths";
import { getCalendarModuleEnabledCached, loadFirmSettings } from "../../../services/firmSettings";

const PLATFORM_ADMIN_ONLY_NAV_KEYS = new Set([
    "firmStaffRoles",
    "platformSettings",
    "planUsage",
]);

function buildBusinessNavLinks({ navigate, openPopup, closePopup, t, calendarEnabled }) {
    return [
        {
            navKey: "allCases",
            routeMatch: AllCasesScreenName,
            buttonText: t("nav.allCases"),
            buttonScreen: t("nav.allCases"),
            icon: null,
            onClick: () => navigate(AdminStackName + AllCasesScreenName),
        },
        {
            navKey: "newOrUpdateCase",
            buttonText: t("nav.newOrUpdateCase"),
            buttonScreen: null,
            icon: null,
            onClick: () => openPopup(<CaseFullView onFailureFunction={() => {}} closePopUpFunction={closePopup} />),
        },
        {
            navKey: "allCaseTypes",
            routeMatch: AllCasesTypeScreenName,
            buttonText: t("nav.allCaseTypes"),
            buttonScreen: t("nav.allCaseTypes"),
            icon: null,
            onClick: () => navigate(AdminStackName + AllCasesTypeScreenName),
        },
        {
            navKey: "allClients",
            routeMatch: AllClientsScreenName,
            buttonText: t("nav.allClients"),
            buttonScreen: t("nav.allClients"),
            icon: null,
            onClick: () => navigate(AdminStackName + AllClientsScreenName),
        },
        {
            navKey: "signingFiles",
            routeMatch: [SigningManagerScreenName, uploadFileForSigningScreenName],
            buttonText: t("nav.signingFiles"),
            buttonScreen: t("nav.signingFiles"),
            icon: null,
            onClick: () => navigate(AdminStackName + SigningManagerScreenName),
        },
        {
            navKey: "reminders",
            routeMatch: RemindersScreenName,
            buttonText: t("nav.reminders"),
            buttonScreen: t("nav.reminders"),
            icon: null,
            onClick: () => navigate(AdminStackName + RemindersScreenName),
        },
        {
            navKey: "support",
            routeMatch: AdminSupportScreenName,
            buttonText: t("nav.support", "תמיכה"),
            buttonScreen: t("nav.support", "תמיכה"),
            icon: null,
            onClick: () => navigate(AdminStackName + AdminSupportScreenName),
        },
        ...(calendarEnabled
            ? [
                  {
                      navKey: "calendar",
                      routeMatch: CalendarScreenName,
                      buttonText: t("nav.calendar"),
                      buttonScreen: t("nav.calendar"),
                      icon: null,
                      onClick: () => navigate(AdminStackName + CalendarScreenName),
                  },
              ]
            : []),
        {
            navKey: "evidenceDocuments",
            routeMatch: EvidenceDocumentsScreenName,
            buttonText: t("nav.evidenceDocuments"),
            buttonScreen: t("nav.evidenceDocuments"),
            icon: null,
            onClick: () => navigate(AdminStackName + EvidenceDocumentsScreenName),
        },
    ];
}

function buildPlatformAdminLinks({ navigate, t, isPlatformAdmin }) {
    if (!isPlatformAdmin) return [];
    return [
        {
            navKey: "allManagers",
            routeMatch: AllMangerScreenName,
            buttonText: t("nav.allManagers"),
            buttonScreen: t("nav.allManagers"),
            icon: null,
            onClick: () => navigate(AdminStackName + AllMangerScreenName),
        },
        {
            navKey: "planUsage",
            routeMatch: [PlanUsageScreenName, PlansPricingScreenName],
            buttonText: t("nav.planUsage"),
            buttonScreen: t("nav.planUsage"),
            icon: null,
            onClick: () => navigate(AdminStackName + PlanUsageScreenName),
        },
        {
            navKey: "firmStaffRoles",
            routeMatch: FirmStaffRolesScreenName,
            buttonText: t("nav.firmStaffRoles", "תפקידים והרשאות"),
            buttonScreen: t("nav.firmStaffRoles", "תפקידים והרשאות"),
            icon: null,
            onClick: () => navigate(AdminStackName + FirmStaffRolesScreenName),
        },
        {
            navKey: "platformSettings",
            routeMatch: PlatformSettingsScreenName,
            buttonText: t("nav.platformSettings", "הגדרות פלטפורמה"),
            buttonScreen: t("nav.platformSettings", "הגדרות פלטפורמה"),
            icon: null,
            onClick: () => navigate(AdminStackName + PlatformSettingsScreenName),
        },
    ];
}

export const getNavBarData = (navigate, openPopup, closePopup, _isFromApp, t, permCtx = null) => {
    loadFirmSettings();
    const calendarEnabled = getCalendarModuleEnabledCached();
    const isPlatformAdmin = typeof window !== "undefined" && localStorage.getItem("isPlatformAdmin") === "true";
    const permissionMode = permCtx?.permissionMode || "legacy";
    const canPage = permCtx?.canPage || (() => true);
    const canAction = permCtx?.canAction || (() => true);

    const businessLinks = buildBusinessNavLinks({ navigate, openPopup, closePopup, t, calendarEnabled });
    const platformLinks = buildPlatformAdminLinks({ navigate, t, isPlatformAdmin });

    if (permissionMode === "role") {
        const officeManagers = { navKey: 'allManagers', routeMatch: AllMangerScreenName, buttonText: t('nav.allManagers'), buttonScreen: t('nav.allManagers'), icon: null, onClick: () => navigate(AdminStackName + AllMangerScreenName) };
        const filtered = [...businessLinks, officeManagers].filter((item) => {
            if (item.navKey === "newOrUpdateCase") {
                return canAction("cases", "create") || canAction("cases", "edit");
            }
            return canPage(item.navKey);
        });
        return { NavBarLinks: filtered };
    }

    if (permissionMode === "platform_admin") {
        return { NavBarLinks: [...businessLinks, ...platformLinks] };
    }

    // legacy — preserve prior behavior; evidence/plan/settings only for PA
    const legacyBusiness = businessLinks.filter((item) => item.navKey !== "evidenceDocuments");
    const legacyPaEvidence = isPlatformAdmin
        ? businessLinks.filter((item) => item.navKey === "evidenceDocuments")
        : [];
    const legacyManagers = isPlatformAdmin
        ? platformLinks.filter((item) => item.navKey === "allManagers")
        : [
              {
                  navKey: "allManagers",
                  routeMatch: AllMangerScreenName,
                  buttonText: t("nav.allManagers"),
                  buttonScreen: t("nav.allManagers"),
                  icon: null,
                  onClick: () => navigate(AdminStackName + AllMangerScreenName),
              },
          ];
    const legacyPaOnly = platformLinks.filter((item) => PLATFORM_ADMIN_ONLY_NAV_KEYS.has(item.navKey));

    return {
        NavBarLinks: [...legacyBusiness, ...legacyPaEvidence, ...legacyManagers, ...legacyPaOnly],
    };
};
