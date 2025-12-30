import SimpleButton from "../../simpleComponents/SimpleButton";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import SimpleIcon from "../../simpleComponents/SimpleIcon";
import { Text16 } from "../../specializedComponents/text/AllTextKindFile";
import { colors } from "../../../constant/colors";
import "./SideBarMenuItem.scss";

export default function SideBarMenuItem({ onPressFunction, isPressed, size, iconColor, iconSource, iconStyle, buttonText, buttonIndex, containerStyle }) {

    function onPress() {
        onPressFunction?.(buttonIndex);
    }

    return (
        <SimpleButton
            onPress={onPress}
            className={`lw-sideBarMenuItem${isPressed ? " is-pressed" : ""}`}
        >
            <SimpleContainer className="lw-sideBarMenuItem__inner">
                <SimpleIcon
                    size={size || 24}
                    tintColor={iconColor || colors.white}
                    src={iconSource}
                    style={iconStyle}
                />
                <Text16 color={colors.white} className="lw-sideBarMenuItem__text">
                    {buttonText}
                </Text16>
            </SimpleContainer>
        </SimpleButton>
    );
}
