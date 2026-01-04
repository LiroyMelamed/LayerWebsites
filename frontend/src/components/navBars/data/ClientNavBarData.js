import { ClientStackName } from "../../../navigation/ClientStack";
import { NotificationsScreenName } from "../../../screens/client/notifications/NotificationsScreen";
import { ProfileScreenName } from "../../../screens/client/profile/ProfileScreen";
import { SigningScreenName } from "../../../screens/signingScreen/SigningScreen";
import TermsOfConditons from "../../termsAndConditions/TermsOfConditons";
import { openExternalUrl } from "../../../utils/externalNavigation";

export const getClientNavBarData = (navigate, openPopup, closePopup, isFromApp = false) => {
    const NavBarLinks = [
        // In the mobile app we already have Notifications/Profile, so hide them from the web menu.
        ...(!isFromApp
            ? [
                {
                    buttonText: "התראות",
                    buttonScreen: null,
                    icon: null,
                    onClick: () => { navigate(ClientStackName + NotificationsScreenName) }
                },
            ]
            : []),
        {
            buttonText: "מסמכים לחתימה",
            buttonScreen: null,
            icon: null,
            onClick: () => { navigate(ClientStackName + SigningScreenName) }
        },
        ...(!isFromApp
            ? [
                {
                    buttonText: "הפרופיל שלי",
                    buttonScreen: null,
                    icon: null,
                    onClick: () => { navigate(ClientStackName + ProfileScreenName) },
                },
            ]
            : []),
        {
            buttonText: "תקנון שימוש",
            buttonScreen: "תקנון שימוש",
            icon: null,
            onClick: () => { openPopup(<TermsOfConditons closePopUpFunction={closePopup} />) },
        },
        {
            buttonText: "יצירת קשר",
            buttonScreen: null,
            icon: null,
            onClick: () => {
                openExternalUrl(
                    "https://wa.me/972522595097?text=%D7%A9%D7%9C%D7%95%D7%9D%2C%20%D7%90%D7%A9%D7%9E%D7%97%20%D7%9C%D7%99%D7%A6%D7%99%D7%A8%D7%AA%20%D7%A7%D7%A9%D7%A8",
                    { newTab: true }
                );
            },
        },
    ];

    return { NavBarLinks };
};
