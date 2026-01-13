import { AllCasesScreenName } from "../../../screens/allCasesScreen/AllCasesScreen";
import { AllMangerScreenName } from "../../../screens/allMangerScreen/AllMangerScreen";
import { AllCasesTypeScreenName } from "../../../screens/allCasesTypeScreen/AllCasesTypeScreen";
import CaseTypeFullView from "../../styledComponents/cases/CaseTypeFullView";
import CaseFullView from "../../styledComponents/cases/CaseFullView";
import { TaggedCasesScreenName } from "../../../screens/taggedCasesScreen/TaggedCasesScreen";
import { AdminStackName } from "../../../navigation/AdminStack";
import { SigningManagerScreenName } from "../../../screens/signingScreen/SigningManagerScreen";
import { AuditTrailScreenName } from "../../../screens/auditTrailScreen/AuditTrailScreen";

export const getNavBarData = (navigate, openPopup, closePopup, _isFromApp, t) => ({
    NavBarLinks: [
        {
            buttonText: t('nav.pinnedCases'),
            buttonScreen: t('nav.pinnedCases'),
            icon: null, // icons.NavBarIcons.Hammer
            onClick: () => navigate(AdminStackName + TaggedCasesScreenName),
        },
        {
            buttonText: t('nav.signingFiles'),
            buttonScreen: t('nav.signingFiles'),
            icon: null,
            onClick: () => navigate(AdminStackName + SigningManagerScreenName),
        },
        {
            buttonText: t('nav.auditTrail'),
            buttonScreen: t('nav.auditTrail'),
            icon: null,
            onClick: () => navigate(AdminStackName + AuditTrailScreenName),
        },
        {
            buttonText: t('nav.allCases'),
            buttonScreen: t('nav.allCases'),
            icon: null, // icons.NavBarIcons.Hammer
            onClick: () => navigate(AdminStackName + AllCasesScreenName),
        },
        {
            buttonText: t('nav.newOrUpdateCase'),
            buttonScreen: null,
            icon: null, // icons.NavBarIcons.NewCase
            onClick: () => openPopup(<CaseFullView onFailureFunction={() => { }} closePopUpFunction={closePopup} />),
        },
        {
            buttonText: t('nav.allManagers'),
            buttonScreen: t('nav.allManagers'),
            icon: null, // icons.NavBarIcons.AllManagers
            onClick: () => navigate(AdminStackName + AllMangerScreenName),
        },
        {
            buttonText: t('nav.allCaseTypes'),
            buttonScreen: t('nav.allCaseTypes'),
            icon: null, // icons.NavBarIcons.AllCasesType
            onClick: () => navigate(AdminStackName + AllCasesTypeScreenName),
        },
        {
            buttonText: t('nav.addCaseType'),
            buttonScreen: null,
            icon: null, // icons.NavBarIcons.AddCaseType
            onClick: () => openPopup(<CaseTypeFullView onFailureFunction={() => { }} closePopUpFunction={closePopup} />),
        },
    ]
});
