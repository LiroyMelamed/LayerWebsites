import React from "react";
import SimpleButton from "../../simpleComponents/SimpleButton";
import SimpleContainer from "../../simpleComponents/SimpleContainer";
import SimpleIcon from "../../simpleComponents/SimpleIcon";
import { Text16 } from "../../specializedComponents/text/AllTextKindFile";
import { colors } from "../../../constant/colors";

export default function SideBarMenuItem({ onPressFunction, isPressed, size, iconColor, iconSource, iconStyle, buttonText, buttonIndex, containerStyle }) {

    function onPress() {
        onPressFunction?.(buttonIndex);
    }

    const ContainerStyle = {
        height: 56,
        padding: 0,
        ...containerStyle
    };

    return (
        <SimpleButton onPress={() => onPress()} style={styles.buttonContainer(isPressed)}>
            <SimpleContainer style={styles.innerContainer}>
                <SimpleIcon
                    size={size || 24}
                    tintColor={iconColor || colors.white}
                    source={iconSource}
                    style={iconStyle}
                />
                <Text16 color={colors.white} style={styles.textStyle}>
                    {buttonText}
                </Text16>
            </SimpleContainer>
        </SimpleButton>
    );
}

const styles = {
    buttonContainer: (isPressed) => ({
        width: '100%',
        backgroundColor: isPressed ? colors.SideBarSelected : colors.transparent,
        height: 56,
    }),
    innerContainer: {
        display: 'flex',
        flexDirection: 'row-reverse',
        alignItems: 'center', // This ensures the icon and text are vertically aligned
    },
    textStyle: {
        display: 'flex',
    }
};
