import React from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text14, TextBold14 } from "../../specializedComponents/text/AllTextKindFile";
import SimpleButton from "../../simpleComponents/SimpleButton";
import { usePopup } from "../../../providers/PopUpProvider";
import ClientPopup from "../../../screens/mainScreen/components/ClientPopUp";

import "./ClientMenuItem.scss";

export default function ClientMenuItem({
    clientName,
    CompanyName,
    clientMail,
    clientPhone,
    clientDetails,
    closePopUpFunction,
    rePerformRequest,
    onPress,
    style: _style
}) {
    const { openPopup } = usePopup();

    function clientPressHandle() {
        if (onPress) {
            onPress()
        } else {
            openPopup(<ClientPopup clientDetails={clientDetails} closePopUpFunction={closePopUpFunction} rePerformRequest={rePerformRequest} />)
        }
    }

    return (
        <SimpleButton onPress={() => clientPressHandle()}>
            <SimpleContainer className="lw-clientMenuItem">

                <SimpleContainer className="lw-clientMenuItem__row">
                    <SimpleContainer className="lw-clientMenuItem__cell">
                        <TextBold14>{CompanyName || "-"}</TextBold14>
                    </SimpleContainer>

                    <SimpleContainer className="lw-clientMenuItem__cell">
                        <Text14>{clientName || "-"}</Text14>
                    </SimpleContainer>

                    <SimpleContainer className="lw-clientMenuItem__cell lw-clientMenuItem__cell--email">
                        <Text14 shouldApplyClamping>{clientMail || "-"}</Text14>
                    </SimpleContainer>

                    <SimpleContainer className="lw-clientMenuItem__cell lw-clientMenuItem__cell--phone">
                        <Text14>{clientPhone || "-"}</Text14>
                    </SimpleContainer>
                </SimpleContainer>

            </SimpleContainer>
        </SimpleButton>
    );
}
