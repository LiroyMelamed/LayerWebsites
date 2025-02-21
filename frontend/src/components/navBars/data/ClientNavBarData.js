import { ClientStackName } from "../../../navigation/ClientStack";
import { UpdatesScreenName } from "../../../screens/client/updates/UpdatesScreen";

export const getClientNavBarData = (navigate, openPopup) => ({
    NavBarLinks: [
        {
            buttonText: "עידכונים",
            buttonScreen: null,
            icon: null, // icons.NavBarIcons.Manager
            onClick: () => { navigate(ClientStackName + UpdatesScreenName) }
        },
        {
            buttonText: "לפרופיל שלי",
            buttonScreen: null,
            icon: null, // icons.NavBarIcons.UpdateCase
        },
        {
            buttonText: "דף הסבר שימוש באתר",
            buttonScreen: "דף הסבר שימוש באתר",
            icon: null, // icons.NavBarIcons.AllCasesType
            onClick: () => { },
        },
        {
            buttonText: "תקנון שימוש",
            buttonScreen: "תקנון שימוש",
            icon: null, // icons.NavBarIcons.AllCasesType
            onClick: () => { },
        },
        {
            buttonText: "ליצירת קשר",
            buttonScreen: null,
            icon: null, // icons.NavBarIcons.NewCase
        },
    ]
});
