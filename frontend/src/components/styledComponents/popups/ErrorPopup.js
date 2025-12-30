import SimpleContainer from "../../simpleComponents/SimpleContainer";
import { Text14, TextBold16 } from "../../specializedComponents/text/AllTextKindFile";
import PrimaryButton from "../buttons/PrimaryButton";
import Separator from "../separators/Separator";

import "./ErrorPopup.scss";

export default function ErrorPopup({ closePopup, errorText }) {
    return (
        <SimpleContainer className="lw-errorPopup">
            <TextBold16>אופס...</TextBold16>

            <Separator className="lw-errorPopup__separator" />

            <Text14 className="lw-errorPopup__message">{errorText}</Text14>

            <Separator className="lw-errorPopup__separator" />

            <div className="lw-errorPopup__actions">
                <PrimaryButton onPress={() => closePopup()}>אישור</PrimaryButton>
            </div>
        </SimpleContainer>
    );
}