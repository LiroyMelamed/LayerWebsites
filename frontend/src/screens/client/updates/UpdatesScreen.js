import { images } from "../../../assets/images/images";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleImage from "../../../components/simpleComponents/SimpleImage";
import SimpleScreen from "../../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../../components/simpleComponents/SimpleScrollView";
import { useScreenSize } from "../../../providers/ScreenSizeProvider";

export const UpdatesScreenName = "/UpdatesScreen";

export default function UpdatesScreen() {
    const { isSmallScreen } = useScreenSize();

    return (
        <SimpleScreen style={styles.screenStyle(isSmallScreen)} imageBackgroundSource={images.Backgrounds.AppBackground}>

            <SimpleScrollView>
                <SimpleContainer style={styles.responsiveContainer}>

                    <SimpleImage
                        src={images.Updates.NewUpdates}
                        style={{ width: '320px', alignSelf: 'center', borderRadius: '12px', marginTop: 40 }}
                    />
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
        display: 'flex',
        flexDirection: 'row-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        width: '100%',
        overflow: 'hidden',
    },
}