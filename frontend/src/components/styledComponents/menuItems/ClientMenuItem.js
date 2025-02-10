import React, { useState } from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import ImageButton from "../../specializedComponents/buttons/ImageButton";
import { Text12, Text14, TextBold12, TextBold14 } from "../../specializedComponents/text/AllTextKindFile";
import ClientMenuItemOpen from "./components/ClientMenuItemOpen";
import { icons } from "../../../assets/icons/icons";

export default function ClientMenuItem({
    clientName = "khru",
    CompanyName = 'nkns',
    clientMail = "dsadasdasd@walla.com",
    clientPhone = "0507299064",
    style
}) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <SimpleContainer style={{ overflow: null }}>

            <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse' }}>
                <TextBold14 style={styles.textContainer}>{CompanyName}</TextBold14>

                <Text14 style={styles.textContainer}>{clientName}</Text14>

                <Text14 style={styles.textContainer}>{clientMail}</Text14>

                <Text14 style={styles.textContainer}>{clientPhone}</Text14>
            </SimpleContainer>

        </SimpleContainer>
    );
}

const styles = {
    textContainer: {
        flex: 1
    }
};