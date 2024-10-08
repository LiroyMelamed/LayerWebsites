import { icons } from "../../../assets/icons/icons";
import { useNavigate } from 'react-router-dom';
import { AllCasesScreenName } from "../../../screens/mainScreen/allCasesScreen/AllCasesScreen";
import { AllMangerScreenName } from "../../../screens/mainScreen/allMangerScreen/AllMangerScreen";
import { AllCasesTypeScreenName } from "../../../screens/mainScreen/allCasesTypeScreen/AllCasesTypeScreen";
import CaseTypeFullView from "../../styledComponents/cases/CaseTypeFullView";
import CaseFullView from "../../styledComponents/cases/CaseFullView";

export const getNavBarData = (navigate, openPopup) => ({
    NavBarLinks: [
        {
            buttonText: "לכל התיקים",
            buttonScreen: "",
            icon: null, // icons.NavBarIcons.Hammer
            onClick: () => navigate(AllCasesScreenName),
        },
        {
            buttonText: "תיק חדש",
            buttonScreen: "",
            icon: null, // icons.NavBarIcons.NewCase
            onClick: () => openPopup(<CaseFullView onFailureFunction={() => { }} />),
        },
        {
            buttonText: "עדכון תיק",
            buttonScreen: "",
            icon: null, // icons.NavBarIcons.UpdateCase
            onClick: () => navigate('/update-case'),
        },
        {
            buttonText: "הוספת מנהל",
            buttonScreen: "",
            icon: null, // icons.NavBarIcons.Manager
            onClick: () => navigate(),
        },
        {
            buttonText: "לכל המנהלים",
            buttonScreen: "",
            icon: null, // icons.NavBarIcons.AllManagers
            onClick: () => navigate(AllMangerScreenName),
        },
        {
            buttonText: "הוספת סוג תיק",
            buttonScreen: "",
            icon: null, // icons.NavBarIcons.AddCaseType
            onClick: () => openPopup(<CaseTypeFullView onFailureFunction={() => { }} />),
        },
        {
            buttonText: "לכל סוגי התיקים",
            buttonScreen: "",
            icon: null, // icons.NavBarIcons.AllCasesType
            onClick: () => navigate(AllCasesTypeScreenName),
        },
    ]
});
