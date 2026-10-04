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

export const getNavBarData = (navigate, openPopup, closePopup, _isFromApp, t, permCtx = null) => {
    loadFirmSettings();
    const calendarEnabled = getCalendarModuleEnabledCached();
    const isPlatformAdmin = typeof window !== 'undefined' && localStorage.getItem('isPlatformAdmin') === 'true';
    const permissionMode = permCtx?.permissionMode || 'legacy';
    const canPage = permCtx?.canPage || (() => true);
    const canAction = permCtx?.canAction || (() => true);

    const links = [
        // ── Cases ──
        {
            navKey: 'allCases',
            routeMatch: AllCasesScreenName,
            buttonText: t('nav.allCases'),
            buttonScreen: t('nav.allCases'),
            icon: null,
            onClick: () => navigate(AdminStackName + AllCasesScreenName),
        },
        {
            navKey: 'newOrUpdateCase',
            buttonText: t('nav.newOrUpdateCase'),
            buttonScreen: null,
            icon: null,
            onClick: () => openPopup(<CaseFullView onFailureFunction={() => { }} closePopUpFunction={closePopup} />),
        },
        // ── Case Types ──
        {
            navKey: 'allCaseTypes',
            routeMatch: AllCasesTypeScreenName,
            buttonText: t('nav.allCaseTypes'),
            buttonScreen: t('nav.allCaseTypes'),
            icon: null,
            onClick: () => navigate(AdminStackName + AllCasesTypeScreenName),
        },
        // ── Signing & Reminders ──
        {
            navKey: 'allClients',
            routeMatch: AllClientsScreenName,
            buttonText: t('nav.allClients'),
            buttonScreen: t('nav.allClients'),
            icon: null,
            onClick: () => navigate(AdminStackName + AllClientsScreenName),
        },
        {
            navKey: 'signingFiles',
            routeMatch: [SigningManagerScreenName, uploadFileForSigningScreenName],
            buttonText: t('nav.signingFiles'),
            buttonScreen: t('nav.signingFiles'),
            icon: null,
            onClick: () => navigate(AdminStackName + SigningManagerScreenName),
        },
        {
            navKey: 'reminders',
            routeMatch: RemindersScreenName,
            buttonText: t('nav.reminders'),
            buttonScreen: t('nav.reminders'),
            icon: null,
            onClick: () => navigate(AdminStackName + RemindersScreenName),
        },
        {
            navKey: 'support',
            routeMatch: AdminSupportScreenName,
            buttonText: t('nav.support', 'תמיכה'),
            buttonScreen: t('nav.support', 'תמיכה'),
            icon: null,
            onClick: () => navigate(AdminStackName + AdminSupportScreenName),
        },
        ...(calendarEnabled ? [{
            navKey: 'calendar',
            routeMatch: CalendarScreenName,
            buttonText: t('nav.calendar'),
            buttonScreen: t('nav.calendar'),
            icon: null,
            onClick: () => navigate(AdminStackName + CalendarScreenName),
        }] : []),
        // ── Admin ──
        {
            navKey: 'allManagers',
            routeMatch: AllMangerScreenName,
            buttonText: t('nav.allManagers'),
            buttonScreen: t('nav.allManagers'),
            icon: null,
            onClick: () => navigate(AdminStackName + AllMangerScreenName),
        },
        // ── Evidence — platform admin only ──
        ...(isPlatformAdmin ? [{
            navKey: 'evidenceDocuments',
            routeMatch: EvidenceDocumentsScreenName,
            buttonText: t('nav.evidenceDocuments'),
            buttonScreen: t('nav.evidenceDocuments'),
            icon: null,
            onClick: () => navigate(AdminStackName + EvidenceDocumentsScreenName),
        }] : []),
        // ── Plan & Usage — platform admin only ──
        ...(isPlatformAdmin ? [{
            navKey: 'planUsage',
            routeMatch: [PlanUsageScreenName, PlansPricingScreenName],
            buttonText: t('nav.planUsage'),
            buttonScreen: t('nav.planUsage'),
            icon: null,
            onClick: () => navigate(AdminStackName + PlanUsageScreenName),
        }] : []),
        // ── Platform Settings — platform admin only ──
        ...(isPlatformAdmin ? [{
            navKey: 'platformSettings',
            routeMatch: PlatformSettingsScreenName,
            buttonText: t('nav.platformSettings', 'הגדרות פלטפורמה'),
            buttonScreen: t('nav.platformSettings', 'הגדרות פלטפורמה'),
            icon: null,
            onClick: () => navigate(AdminStackName + PlatformSettingsScreenName),
        }] : []),
        ...(isPlatformAdmin ? [{
            navKey: 'firmStaffRoles',
            routeMatch: FirmStaffRolesScreenName,
            buttonText: t('nav.firmStaffRoles', 'תפקידים והרשאות'),
            buttonScreen: t('nav.firmStaffRoles', 'תפקידים והרשאות'),
            icon: null,
            onClick: () => navigate(AdminStackName + FirmStaffRolesScreenName),
        }] : []),
    ];

    const filtered =
        permissionMode === 'role'
            ? links.filter((item) => {
                  if (item.navKey === 'firmStaffRoles' || item.navKey === 'platformSettings' || item.navKey === 'planUsage' || item.navKey === 'evidenceDocuments') {
                      return isPlatformAdmin;
                  }
                  if (item.navKey === 'newOrUpdateCase') {
                      return canAction('cases', 'create') || canAction('cases', 'edit');
                  }
                  return canPage(item.navKey);
              })
            : links;

    return { NavBarLinks: filtered };
};
