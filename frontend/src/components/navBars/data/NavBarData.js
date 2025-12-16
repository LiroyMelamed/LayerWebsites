import { AllCasesScreenName } from "../../../screens/allCasesScreen/AllCasesScreen";
import { AllMangerScreenName } from "../../../screens/allMangerScreen/AllMangerScreen";
import { AllCasesTypeScreenName } from "../../../screens/allCasesTypeScreen/AllCasesTypeScreen";
import CaseTypeFullView from "../../styledComponents/cases/CaseTypeFullView";
import CaseFullView from "../../styledComponents/cases/CaseFullView";
import { TaggedCasesScreenName } from "../../../screens/taggedCasesScreen/TaggedCasesScreen";
import { AdminStackName } from "../../../navigation/AdminStack";
import { SigningManagerScreenName } from "../../../screens/signingScreen/SigningManagerScreen";

export const getNavBarData = (navigate, openPopup, closePopup) => ({
    NavBarLinks: [
        {
            buttonText: "לתיקים נעוצים",
            buttonScreen: "תיקים נעוצים",
            icon: null, // icons.NavBarIcons.Hammer
            onClick: () => navigate(AdminStackName + TaggedCasesScreenName),
        },
        {
            buttonText: "מסמכים לחתימה",
            buttonScreen: "מסמכים לחתימה",
            icon: null,
            onClick: () => navigate(AdminStackName + SigningManagerScreenName),
        },
        {
            buttonText: "לכל התיקים",
            buttonScreen: "כל התיקים",
            icon: null, // icons.NavBarIcons.Hammer
            onClick: () => navigate(AdminStackName + AllCasesScreenName),
        },
        {
            buttonText: "תיק חדש / עדכון תיק",
            buttonScreen: null,
            icon: null, // icons.NavBarIcons.NewCase
            onClick: () => openPopup(<CaseFullView onFailureFunction={() => { }} closePopUpFunction={closePopup} />),
        },
        {
            buttonText: "לכל המנהלים",
            buttonScreen: "כל המנהלים",
            icon: null, // icons.NavBarIcons.AllManagers
            onClick: () => navigate(AdminStackName + AllMangerScreenName),
        },
        {
            buttonText: "לכל סוגי התיקים",
            buttonScreen: "כל סוגי התיקים",
            icon: null, // icons.NavBarIcons.AllCasesType
            onClick: () => navigate(AdminStackName + AllCasesTypeScreenName),
        },
        {
            buttonText: "הוספת סוג תיק",
            buttonScreen: null,
            icon: null, // icons.NavBarIcons.AddCaseType
            onClick: () => openPopup(<CaseTypeFullView onFailureFunction={() => { }} closePopUpFunction={closePopup} />),
        },
    ]
});
