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
import SimpleImage from "../../../components/simpleComponents/SimpleImage";

export const UpdatesAndNotificationsScreenName = "/UpdatesAndNotificationsScreen";

const updatesMenuItems = [
    {
        name: 'התראות',
        screenName: 'MessagesScreenName',
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

    function handleUpdatesMenuItemPress(item) {
        openPopup(<Text12>{`שירות ${item.name} יהיה זמין בקרוב`}</Text12>)
    }

    return (
        <SimpleScreen style={styles.screenStyle(isSmallScreen)} imageBackgroundSource={images.Backgrounds.AppBackground}>
            {isSmallScreen && <TopToolBarSmallScreen LogoNavigate={ClientStackName + ClientMainScreenName} GetNavBarData={getClientNavBarData} />}

            <SimpleScrollView style={{ marginTop: 40, }}>
                <SimpleContainer style={styles.responsiveContainer}>
                    <SimpleImage
                        src={images.Updates.NewUpdates}
                        style={{ maxWidth: '100%', padding: '0px 20px' }}
                    />

                    <SimpleCard style={{ flexDirection: 'column' }}>
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

const styles = {
    screenStyle: () => ({
        boxSizing: 'border-box',
        flexDirection: 'column',
    }),
    responsiveContainer: {
        flexDirection: 'column',
        width: '100%',
    },
}