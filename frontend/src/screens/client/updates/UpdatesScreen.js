import { useNavigate } from "react-router-dom";
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

const updatesMenuItems = [
    {
        name: 'התראות',
        screenName: NotificationsScreenName,
    },
    {
        name: 'עידכונים',
        screenName: 'MessagesScreenName',
    },
    {
        name: 'הודעות',
        screenName: 'MessagesScreenName',
    },
]

export default function UpdatesAndNotificationsScreen() {
    const { openPopup, closePopup } = usePopup();
    const { isSmallScreen } = useScreenSize();
    const navigate = useNavigate();

    function handleUpdatesMenuItemPress(item) {
        if (item.screenName === NotificationsScreenName) {
            navigate(ClientStackName + NotificationsScreenName);
            return;
        }

        openPopup(<Text12>{`שירות ${item.name} יהיה זמין בקרוב`}</Text12>);
    }

    return (
        <SimpleScreen imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen LogoNavigate={ClientStackName + ClientMainScreenName} GetNavBarData={getClientNavBarData} />}

            <SimpleScrollView className="lw-updatesScreen__scroll">
                <SimpleContainer className="lw-updatesScreen__container">
                    {/* <SimpleImage
                        src={images.Updates.NewUpdates}
                        style={{ maxWidth: '100%', padding: '0px 20px' }}
                    /> */}

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
