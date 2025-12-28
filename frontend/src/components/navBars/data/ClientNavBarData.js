import { ClientStackName } from "../../../navigation/ClientStack";
import { NotificationsScreenName } from "../../../screens/client/notifications/NotificationsScreen";
import { ProfileScreenName } from "../../../screens/client/profile/ProfileScreen";
import { SigningScreenName } from "../../../screens/signingScreen/SigningScreen";
import { Text12 } from "../../specializedComponents/text/AllTextKindFile";
import TermsOfConditons from "../../termsAndConditions/TermsOfConditons";

export const getClientNavBarData = (navigate, openPopup, closePopup) => ({
    NavBarLinks: [
        {
            buttonText: "התראות",
            buttonScreen: null,
            icon: null, // icons.NavBarIcons.Manager
            onClick: () => { navigate(ClientStackName + NotificationsScreenName) }
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
            onClick: () => { navigate(ClientStackName + ProfileScreenName) },
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
