import { DateDDMMYY } from "../../../functions/date/DateDDMMYY";
import { usePopup } from "../../../providers/PopUpProvider";
import AdminPopup from "../../../screens/allMangerScreen/components/AdminPopup";
import SimpleButton from "../../simpleComponents/SimpleButton";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text14, TextBold14 } from "../../specializedComponents/text/AllTextKindFile";

export default function AdminMenuItem({
    adminName = "khru",
    CreatedAt = '12/02/2025',
    adminMail = "dsadasdasd@walla.com",
    adminPhone = "0507299064",
    admin,
    onPress,
    style
}) {
    const { openPopup } = usePopup();

    function AdminPressed(params) {
        if (onPress) {
            onPress()
        } else {
            openPopup(<AdminPopup adminDetails={admin} />)
        }
    }

    return (
        <SimpleButton onPress={() => AdminPressed()}>
            <SimpleContainer style={{ overflow: null, flexDirection: 'column', ...style }}>

                <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse' }}>
                    <TextBold14 style={styles.textContainer}>{adminName}</TextBold14>

                    <Text14 style={styles.textContainer} >{DateDDMMYY(CreatedAt)}</Text14>

                    <Text14 style={styles.textContainer} shouldApplyClamping>{adminMail}</Text14>

                    <Text14 style={styles.textContainer}>{adminPhone}</Text14>
                </SimpleContainer>

            </SimpleContainer>
        </SimpleButton>
    );
}

const styles = {
    textContainer: {
        flex: 1,
        alignText: 'right',
        margin: '0px 6px',
    }
};