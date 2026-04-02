import { AllCasesScreenName } from "../../../screens/allCasesScreen/AllCasesScreen";
import { AllMangerScreenName } from "../../../screens/allMangerScreen/AllMangerScreen";
import { AllCasesTypeScreenName } from "../../../screens/allCasesTypeScreen/AllCasesTypeScreen";
import CaseFullView from "../../styledComponents/cases/CaseFullView";
import { AdminStackName } from "../../../navigation/AdminStack";
import { SigningManagerScreenName } from "../../../screens/signingScreen/SigningManagerScreen";
import { EvidenceDocumentsScreenName } from "../../../screens/evidenceDocuments/EvidenceDocumentsScreen";
import { PlanUsageScreenName } from "../../../screens/billingScreen/PlanUsageScreen";
import { PlansPricingScreenName } from "../../../screens/billingScreen/PlansPricingScreen";
import { PlatformSettingsScreenName } from "../../../screens/platformSettingsScreen/PlatformSettingsScreen";
import { RemindersScreenName } from "../../../screens/remindersScreen/RemindersScreen";
import { uploadFileForSigningScreenName } from "../../../screens/signingScreen/UploadFileForSigningScreen";
import { AllClientsScreenName } from "../../../screens/allClientsScreen/AllClientsScreen";

export const getNavBarData = (navigate, openPopup, closePopup, _isFromApp, t) => {
    const isPlatformAdmin = typeof window !== 'undefined' && localStorage.getItem('isPlatformAdmin') === 'true';

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
    ];

    return { NavBarLinks: links };
};
