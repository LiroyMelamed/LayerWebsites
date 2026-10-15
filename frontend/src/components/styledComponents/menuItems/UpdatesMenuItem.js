import { icons } from "../../../assets/icons/icons";
import SimpleButton from "../../simpleComponents/SimpleButton";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import SimpleIcon from "../../simpleComponents/SimpleIcon";
import { TextBold14 } from "../../specializedComponents/text/AllTextKindFile";

import "./UpdatesMenuItem.scss";

export default function UpdatesMenuItem({ menuItemName, onPress, style: _style }) {

    return (
        <SimpleButton
            onPress={onPress}
            className="lw-updatesMenuItem"
        >
            <SimpleContainer className="lw-updatesMenuItem__text">
                <TextBold14>{menuItemName}</TextBold14>
            </SimpleContainer>

            <SimpleIcon
                src={icons.Button.DownArrow}
                size={14}
                className="lw-updatesMenuItem__icon"
            />
        </SimpleButton>
    );
}
