import { AllCasesScreenName } from "../../../screens/allCasesScreen/AllCasesScreen";
import { AllMangerScreenName } from "../../../screens/allMangerScreen/AllMangerScreen";
import { AllCasesTypeScreenName } from "../../../screens/allCasesTypeScreen/AllCasesTypeScreen";
import CaseTypeFullView from "../../styledComponents/cases/CaseTypeFullView";
import CaseFullView from "../../styledComponents/cases/CaseFullView";
import { TaggedCasesScreenName } from "../../../screens/taggedCasesScreen/TaggedCasesScreen";

export const getNavBarData = (navigate, openPopup) => ({
    NavBarLinks: [
        {
            buttonText: "לתיקים נעוצים",
            buttonScreen: "תיקים נעוצים",
            icon: null, // icons.NavBarIcons.Hammer
            onClick: () => navigate(TaggedCasesScreenName),
        },
        {
            buttonText: "לכל התיקים",
            buttonScreen: "כל התיקים",
            icon: null, // icons.NavBarIcons.Hammer
            onClick: () => navigate(AllCasesScreenName),
        },
        {
            buttonText: "תיק חדש",
            buttonScreen: null,
            icon: null, // icons.NavBarIcons.NewCase
            onClick: () => openPopup(<CaseFullView onFailureFunction={() => { }} />),
        },
        {
            buttonText: "עדכון תיק",
            buttonScreen: null,
            icon: null, // icons.NavBarIcons.UpdateCase
            onClick: () => openPopup(<CaseFullView onFailureFunction={() => { }} />),
        },
        {
            buttonText: "לכל המנהלים",
            buttonScreen: "כל המנהלים",
            icon: null, // icons.NavBarIcons.AllManagers
            onClick: () => navigate(AllMangerScreenName),
        },
        {
            buttonText: "הוספת מנהל",
            buttonScreen: null,
            icon: null, // icons.NavBarIcons.Manager
            onClick: () => navigate(),
        },
        {
            buttonText: "לכל סוגי התיקים",
            buttonScreen: "כל סוגי התיקים",
            icon: null, // icons.NavBarIcons.AllCasesType
            onClick: () => navigate(AllCasesTypeScreenName),
        },
        {
            buttonText: "הוספת סוג תיק",
            buttonScreen: null,
            icon: null, // icons.NavBarIcons.AddCaseType
            onClick: () => openPopup(<CaseTypeFullView onFailureFunction={() => { }} caseTypeName={null} />),
        },
    ]
});
