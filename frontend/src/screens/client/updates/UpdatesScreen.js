import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { images } from "../../../assets/images/images";
import SimpleCard from "../../../components/simpleComponents/SimpleCard";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleScreen from "../../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import UpdatesMenuItem from "../../../components/styledComponents/menuItems/UpdatesMenuItem";
import { useScreenSize } from "../../../providers/ScreenSizeProvider";
import { usePopup } from "../../../providers/PopUpProvider";
import { Text12 } from "../../../components/specializedComponents/text/AllTextKindFile";
import TopToolBarSmallScreen from "../../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen";
import { ClientStackName } from "../../../navigation/ClientStack";
import { ClientMainScreenName } from "../clientMainScreen/ClientMainScreen";
import { getClientNavBarData } from "../../../components/navBars/data/ClientNavBarData";
import { NotificationsScreenName } from "../notifications/NotificationsScreen";

import "./UpdatesScreen.scss";

export const UpdatesAndNotificationsScreenName = "/UpdatesAndNotificationsScreen";

export default function UpdatesAndNotificationsScreen() {
    const { t } = useTranslation();
    const { openPopup, closePopup } = usePopup();
    const { isSmallScreen } = useScreenSize();
    const navigate = useNavigate();

    const updatesMenuItems = [
        {
            name: t("updates.notifications"),
            screenName: NotificationsScreenName,
        },
        {
            name: t("updates.updates"),
            screenName: 'MessagesScreenName',
        },
        {
            name: t("updates.messages"),
            screenName: 'MessagesScreenName',
        },
    ];

    function handleUpdatesMenuItemPress(item) {
        if (item.screenName === NotificationsScreenName) {
            navigate(ClientStackName + NotificationsScreenName);
            return;
        }

        openPopup(<Text12>{t("updates.serviceComingSoon", { name: item.name })}</Text12>);
    }

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen LogoNavigate={ClientStackName + ClientMainScreenName} GetNavBarData={getClientNavBarData} />}

            <SimpleScrollView className="lw-updatesScreen__scroll">
                <SimpleContainer className="lw-updatesScreen__container">
                    <SimpleCard className="lw-updatesScreen__card">
                        {updatesMenuItems.map(item => (
                            <UpdatesMenuItem
                                menuItemName={item.name}
                                onPress={() => handleUpdatesMenuItemPress(item)}
                            />
                        ))}
                    </SimpleCard>
                </SimpleContainer>
            </SimpleScrollView>

        </SimpleScreen >

    );
}
