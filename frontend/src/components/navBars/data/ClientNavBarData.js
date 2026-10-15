import {
    NotificationsScreenName,
    ProfileScreenName,
    ClientTicketScreenName,
    ClientMainScreenName,
    ClientCasesScreenName,
    ClientDocumentsScreenName,
} from "../../../navigation/screenPaths";
import TermsOfConditons from "../../termsAndConditions/TermsOfConditons";
import { openExternalUrl } from "../../../utils/externalNavigation";
import { getFirmPhone } from "../../../services/firmSettings";
import { clientPortalPath } from '../../../utils/clientPortalNavigation';

export const getClientNavBarData = (navigate, openPopup, closePopup, isFromApp = false, t) => {
    const NavBarLinks = [
        ...[
            ['clientHome', ClientMainScreenName, 'clientPortal.home'],
            ['clientDocuments', ClientDocumentsScreenName, 'clientPortal.myDocuments'],
            ['clientCases', ClientCasesScreenName, 'clientPortal.caseStatus'],
        ].map(([navKey, routeMatch, label]) => ({
            navKey, routeMatch, buttonText: t(label), buttonScreen: null, icon: null,
            onClick: () => navigate(clientPortalPath(window.location.pathname, routeMatch)),
        })),
        // In the mobile app we already have Notifications/Profile, so hide them from the web menu.
        ...(!isFromApp
            ? [
                {
                    navKey: 'notifications',
                    routeMatch: NotificationsScreenName,
                    buttonText: t('nav.notifications'),
                    buttonScreen: null,
                    icon: null,
                    onClick: () => { navigate(clientPortalPath(window.location.pathname, NotificationsScreenName)) }
                },
            ]
            : []),
        {
            navKey: 'supportTicket',
            routeMatch: ClientTicketScreenName,
            buttonText: t('nav.supportTicket', { defaultValue: 'פנייה לתמיכה' }),
            buttonScreen: null,
            icon: null,
            onClick: () => { navigate(clientPortalPath(window.location.pathname, ClientTicketScreenName)) }
        },
        ...(!isFromApp
            ? [
                {
                    navKey: 'myProfile',
                    routeMatch: ProfileScreenName,
                    buttonText: t('nav.myProfile'),
                    buttonScreen: null,
                    icon: null,
                    onClick: () => { navigate(clientPortalPath(window.location.pathname, ProfileScreenName)) },
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
