import { usePopup } from "../../../providers/PopUpProvider";
import SimpleButton from "../../simpleComponents/SimpleButton";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text14, TextBold14 } from "../../specializedComponents/text/AllTextKindFile";

export default function AdminMenuItem({
    adminName = "khru",
    CreatedAt = '12/02/2025',
    adminMail = "dsadasdasd@walla.com",
    adminPhone = "0507299064",
    onPress,
    style
}) {
    const { openPopup } = usePopup();

    // function name(params) { //TODO create Client Popup
    //     if (onPress) {
    //         onPress()
    //     } else {
    //         openPopup()
    //     }
    // }

    return (
        <SimpleButton onPress={() => onPress?.()}>
            <SimpleContainer style={{ overflow: null, flexDirection: 'column', ...style }}>

                <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse' }}>
                    <TextBold14 style={styles.textContainer}>{adminName}</TextBold14>

                    <Text14 style={styles.textContainer}>{CreatedAt}</Text14>

                    <Text14 style={styles.textContainer}>{adminMail}</Text14>

                    <Text14 style={styles.textContainer}>{adminPhone}</Text14>
                </SimpleContainer>

            </SimpleContainer>
        </SimpleButton>
    );
}

const styles = {
    textContainer: {
        flex: 1
    }
};