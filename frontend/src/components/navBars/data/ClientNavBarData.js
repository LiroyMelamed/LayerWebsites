import { ClientStackName } from "../../../navigation/ClientStack";
import { NotificationsScreenName } from "../../../screens/client/notifications/NotificationsScreen";
import { ProfileScreenName } from "../../../screens/client/profile/ProfileScreen";
import { SigningScreenName } from "../../../screens/signingScreen/SigningScreen";
import TermsOfConditons from "../../termsAndConditions/TermsOfConditons";
import { openExternalUrl } from "../../../utils/externalNavigation";
import { getFirmPhone } from "../../../services/firmSettings";

export const getClientNavBarData = (navigate, openPopup, closePopup, isFromApp = false, t) => {
    const NavBarLinks = [
        // In the mobile app we already have Notifications/Profile, so hide them from the web menu.
        ...(!isFromApp
            ? [
                {
                    navKey: 'notifications',
                    routeMatch: NotificationsScreenName,
                    buttonText: t('nav.notifications'),
                    buttonScreen: null,
                    icon: null,
                    onClick: () => { navigate(ClientStackName + NotificationsScreenName) }
                },
            ]
            : []),
        {
            navKey: 'signingFiles',
            routeMatch: SigningScreenName,
            buttonText: t('nav.signingFiles'),
            buttonScreen: null,
            icon: null,
            onClick: () => { navigate(ClientStackName + SigningScreenName) }
        },
        ...(!isFromApp
            ? [
                {
                    navKey: 'myProfile',
                    routeMatch: ProfileScreenName,
                    buttonText: t('nav.myProfile'),
                    buttonScreen: null,
                    icon: null,
                    onClick: () => { navigate(ClientStackName + ProfileScreenName) },
                },
            ]
            : []),
        {
            navKey: 'terms',
            buttonText: t('nav.terms'),
            buttonScreen: t('nav.terms'),
            icon: null,
            onClick: () => { openPopup(<TermsOfConditons closePopUpFunction={closePopup} />) },
        },

        ...(!isFromApp
            ? [
                {
                    navKey: 'contact',
                    buttonText: t('nav.contact'),
                    buttonScreen: null,
                    icon: null,
                    onClick: () => {
                        openExternalUrl(
                            `https://wa.me/${getFirmPhone()}?text=${encodeURIComponent(t('nav.contactMessage'))}`,
                            { newTab: true }
                        );
                    },
                },
            ]
            : []),
    ];

    return { NavBarLinks };
};
