import { ClientStackName } from "../../../navigation/ClientStack";
import { NotificationsScreenName } from "../../../screens/client/notifications/NotificationsScreen";
import { ProfileScreenName } from "../../../screens/client/profile/ProfileScreen";
import { SigningScreenName } from "../../../screens/signingScreen/SigningScreen";
import TermsOfConditons from "../../termsAndConditions/TermsOfConditons";
import { openExternalUrl } from "../../../utils/externalNavigation";

export const getClientNavBarData = (navigate, openPopup, closePopup, isFromApp = false, t) => {
    const NavBarLinks = [
        // In the mobile app we already have Notifications/Profile, so hide them from the web menu.
        ...(!isFromApp
            ? [
                {
                    buttonText: t('nav.notifications'),
                    buttonScreen: null,
                    icon: null,
                    onClick: () => { navigate(ClientStackName + NotificationsScreenName) }
                },
            ]
            : []),
        {
            buttonText: t('nav.signingFiles'),
            buttonScreen: null,
            icon: null,
            onClick: () => { navigate(ClientStackName + SigningScreenName) }
        },
        ...(!isFromApp
            ? [
                {
                    buttonText: t('nav.myProfile'),
                    buttonScreen: null,
                    icon: null,
                    onClick: () => { navigate(ClientStackName + ProfileScreenName) },
                },
            ]
            : []),
        {
            buttonText: t('nav.terms'),
            buttonScreen: t('nav.terms'),
            icon: null,
            onClick: () => { openPopup(<TermsOfConditons closePopUpFunction={closePopup} />) },
        },

        ...(!isFromApp
            ? [
                {
                    buttonText: t('nav.contact'),
                    buttonScreen: null,
                    icon: null,
                    onClick: () => {
                        openExternalUrl(
                            `https://wa.me/972522595097?text=${encodeURIComponent(t('nav.contactMessage'))}`,
                            { newTab: true }
                        );
                    },
                },
            ]
            : []),
    ];

    return { NavBarLinks };
};
