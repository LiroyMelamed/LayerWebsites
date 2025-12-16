import { ClientStackName } from "../../../navigation/ClientStack";
import { UpdatesAndNotificationsScreenName } from "../../../screens/client/updates/UpdatesScreen";
import { SigningScreenName } from "../../../screens/signingScreen/SigningScreen";
import { Text12 } from "../../specializedComponents/text/AllTextKindFile";
import TermsOfConditons from "../../termsAndConditions/TermsOfConditons";

export const getClientNavBarData = (navigate, openPopup, closePopup) => ({
    NavBarLinks: [
        {
            buttonText: "עידכונים והתראות",
            buttonScreen: null,
            icon: null, // icons.NavBarIcons.Manager
            onClick: () => { navigate(ClientStackName + UpdatesAndNotificationsScreenName) }
        },
        {
            buttonText: "מסמכים לחתימה",
            buttonScreen: null,
            icon: null,
            onClick: () => { navigate(ClientStackName + SigningScreenName) }
        },
        {
            buttonText: "הפרופיל שלי",
            buttonScreen: null,
            icon: null, // icons.NavBarIcons.UpdateCase
            onClick: () => { openPopup(<Text12>{`שירות הפרופיל שלי יהיה זמין בקרוב`}</Text12>) },
        },

        {
            buttonText: "תקנון שימוש",
            buttonScreen: "תקנון שימוש",
            icon: null, // icons.NavBarIcons.AllCasesType
            onClick: () => { openPopup(<TermsOfConditons closePopUpFunction={closePopup} />) },
        },
        {
            buttonText: "יצירת קשר",
            buttonScreen: null,
            icon: null, // icons.NavBarIcons.NewCase
            onClick: () => { openPopup(<Text12>{`שירות יצירת קשר יהיה זמין בקרוב`}</Text12>) },
        },
    ]
});
