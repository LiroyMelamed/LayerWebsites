import { images } from "../../assets/images/images";
import SimpleContainer from "../../components/simpleComponents/SimpleContainer";
import SimpleScreen from "../../components/simpleComponents/SimpleScreen";
import SimpleScrollView from "../../components/simpleComponents/SimpleScrollView";
import SearchInput from "../../components/specializedComponents/containers/SearchInput";
import { Text40 } from "../../components/specializedComponents/text/AllTextKindFile";
import ChooseButton from "../../components/styledComponents/buttons/ChooseButton";
import { useScreenSize } from "../../providers/ScreenSizeProvider";

export const AllCasesTypeScreenName = "/AllCasesType"

export default function AllCasesTypeScreen() {
    const { isSmallScreen } = useScreenSize();

    return (
        <SimpleScreen style={styles.screenStyle(isSmallScreen)} imageBackgroundSource={images.Backgrounds.AppBackground}>
            <SimpleScrollView>
                <SimpleContainer style={styles.responsiveContainer}>
                    <SearchInput
                        title={"חיפוש סוג תיק"}
                        titleFontSize={20}
                        getButtonTextFunction={(item) => item.CaseName}
                        style={styles.searchInput}
                    />
                    <ChooseButton style={styles.chooseButton} buttonText="כמות שלבים" />
                </SimpleContainer>
            </SimpleScrollView>

        </SimpleScreen>
    )
}

const styles = {
    screenStyle: (isSmallScreen) => ({
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