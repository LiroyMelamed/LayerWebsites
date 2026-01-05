import { DateDDMMYY } from "../../../functions/date/DateDDMMYY";
import { usePopup } from "../../../providers/PopUpProvider";
import AdminPopup from "../../../screens/allMangerScreen/components/AdminPopup";
import SimpleButton from "../../simpleComponents/SimpleButton";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text14, TextBold14 } from "../../specializedComponents/text/AllTextKindFile";

import "./AdminMenuItem.scss";

export default function AdminMenuItem({
    adminName,
    CreatedAt,
    adminMail,
    adminPhone,
    admin,
    onPress,
    performGetAdmins,
    style
}) {
    const { openPopup, closePopup } = usePopup();

    function AdminPressed(params) {
        if (onPress) {
            onPress()
        } else {
            openPopup(<AdminPopup adminDetails={admin} closePopUpFunction={() => { closePopup(); performGetAdmins?.(); }} />)
        }
    }

    return (
        <SimpleButton onPress={() => AdminPressed()} className="lw-adminsCard__item">
            <SimpleContainer className="lw-adminMenuItem" style={style}>

                <SimpleContainer className="lw-adminMenuItem__row">
                    <SimpleContainer className="lw-adminMenuItem__cell">
                        <TextBold14>{adminName}</TextBold14>
                    </SimpleContainer>

                    <SimpleContainer className="lw-adminMenuItem__cell">
                        <Text14>{DateDDMMYY(CreatedAt)}</Text14>
                    </SimpleContainer>

                    <SimpleContainer className="lw-adminMenuItem__cell lw-adminMenuItem__cell--email">
                        <Text14 shouldApplyClamping>{adminMail}</Text14>
                    </SimpleContainer>

                    <SimpleContainer className="lw-adminMenuItem__cell">
                        <Text14>{adminPhone}</Text14>
                    </SimpleContainer>
                </SimpleContainer>

            </SimpleContainer>
        </SimpleButton>
    );
}
