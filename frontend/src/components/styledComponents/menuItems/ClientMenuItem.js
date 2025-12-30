import React from "react";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text14, TextBold14 } from "../../specializedComponents/text/AllTextKindFile";
import SimpleButton from "../../simpleComponents/SimpleButton";
import { usePopup } from "../../../providers/PopUpProvider";
import ClientPopup from "../../../screens/mainScreen/components/ClientPopUp";

import "./ClientMenuItem.scss";

export default function ClientMenuItem({
    clientName = "khru",
    CompanyName = 'nkns',
    clientMail = "dsadasdasd@walla.com",
    clientPhone = "0507299064",
    clientDetails,
    closePopUpFunction,
    rePerformRequest,
    onPress,
    style
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
            <SimpleContainer className="lw-clientMenuItem" style={style}>

                <SimpleContainer className="lw-clientMenuItem__row">
                    <div className="lw-clientMenuItem__cell">
                        <TextBold14>{CompanyName || "-"}</TextBold14>
                    </div>

                    <div className="lw-clientMenuItem__cell">
                        <Text14>{clientName || "-"}</Text14>
                    </div>

                    <div className="lw-clientMenuItem__cell lw-clientMenuItem__cell--email">
                        <Text14 shouldApplyClamping>{clientMail || "-"}</Text14>
                    </div>

                    <div className="lw-clientMenuItem__cell">
                        <Text14>{clientPhone || "-"}</Text14>
                    </div>
                </SimpleContainer>

            </SimpleContainer>
        </SimpleButton>
    );
}
