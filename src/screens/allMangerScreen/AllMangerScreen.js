import { images } from "../../assets/images/images";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SearchInput from "../../components/specializedComponents/containers/SearchInput";
import { Text40 } from "../../components/specializedComponents/text/AllTextKindFile";
import ChooseButton from "../../components/styledComponents/buttons/ChooseButton";
import { useScreenSize } from "../../providers/ScreenSizeProvider";

export const AllMangerScreenName = "/AllManger"

export default function AllMangerScreen() {
    const { isSmallScreen } = useScreenSize();

    return (
        <SimpleScreen style={styles.screenStyle(isSmallScreen)} imageBackgroundSource={images.Backgrounds.AppBackground}>
            <SimpleContainer style={styles.responsiveContainer}>
                <Text40 style={{ alignSelf: 'center', textAlign: 'center', marginLeft: 20 }}>כל המנהלים</Text40>
                <SearchInput
                    title={"חיפוש תיק"}
                    titleFontSize={20}
                    getButtonTextFunction={(item) => item.CaseName}
                    style={styles.searchInput}
                />
                <ChooseButton style={styles.chooseButton} />
            </SimpleContainer>
        </SimpleScreen>
    )
}

const styles = {
    screenStyle: (isSmallScreen) => ({
        paddingTop: isSmallScreen ? 100 : 40,
        paddingRight: 20,
        paddingLeft: 20,
        boxSizing: 'border-box',
    }),
    responsiveContainer: {
        display: 'flex',
        flexDirection: 'row-reverse',
        alignItems: 'center',
        flexWrap: 'wrap',
        maxWidth: '100%',
        overflow: 'hidden',
    },
    searchInput: {
        margin: "12px 0px",
        marginLeft: 20,
        flex: '1 1 200px',
        maxWidth: '500px',
    },
    chooseButton: {
        margin: "12px 0px",
        flex: '0 1 auto',
        minWidth: '100px',
    }
}