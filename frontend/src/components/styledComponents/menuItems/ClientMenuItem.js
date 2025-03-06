import React from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text14, TextBold14 } from "../../specializedComponents/text/AllTextKindFile";
import SimpleButton from "../../simpleComponents/SimpleButton";
import { usePopup } from "../../../providers/PopUpProvider";
import ClientPopup from "../../../screens/mainScreen/components/ClientPopUp";

export default function ClientMenuItem({
    clientName = "khru",
    CompanyName = 'nkns',
    clientMail = "dsadasdasd@walla.com",
    clientPhone = "0507299064",
    clientDetails,
    onPress,
    style
}) {
    const { openPopup } = usePopup();

    function clientPressHandle() {
        if (onPress) {
            onPress()
        } else {
            openPopup(<ClientPopup clientDetails={clientDetails} />)
        }
    }

    return (
        <SimpleButton onPress={() => clientPressHandle()}>
            <SimpleContainer style={{ overflow: null, flexDirection: 'column', ...style }}>

                <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse' }}>
                    <TextBold14 style={styles.textContainer}>{CompanyName}</TextBold14>

                    <Text14 style={styles.textContainer}>{clientName}</Text14>

                    <Text14 style={styles.textContainer} shouldApplyClamping>{clientMail}</Text14>

                    <Text14 style={styles.textContainer}>{clientPhone}</Text14>
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