import React, { useState, forwardRef } from "react";
import { buttonSizes } from "../../../styles/buttons/buttonSizes";
import { colors } from "../../../constant/colors";
import SimpleLoader from "../../simpleComponents/SimpleLoader";
import TextButtonWithTwoOptionalIcons from "../../specializedComponents/buttons/TextButtonWithTwoOptionalIcons";

const ICON_SIZE = 12;

const GenericButton = forwardRef(({
    children,
    disabled,
    size = buttonSizes.LARGE,

    backgroundColor = colors.transparent,
    pressedBackgroundColor = colors.transparent,
    disabledBackgroundColor = colors.transparent,

    contentColor = colors.black,
    pressedContentColor = colors.black,
    disabledContentColor = colors.black,

    hasBorder = false,
    leftIcon,
    rightIcon,

    holdPressed = false,
    onPress,
    onPressIn,
    onPressOut,

    shadowColor = colors.transparent,
    isProcessing = false,
    style: customStyle = {},
    ...props
}, ref) => {
    const [isPressed, setIsPressed] = useState(false);

    function handlePressIn(event) {
        if (isPressable()) {
            setIsPressed(true);
            onPressIn?.(event);
        }
    }

    function handlePressOut(event) {
        if (isPressable()) {
            setIsPressed(false);
            onPressOut?.(event);
        }
    }

    function handlePress(event) {
        if (isPressable()) {
            setIsPressed(false);
            onPress?.(event);
        }
    }

    function isPressable() {
        return !disabled && !isProcessing;
    }

    function isButtonPressed() {
        return holdPressed || isPressed;
    }

    function getContentColor() {
        if (disabled) {
            return disabledContentColor;
        }
        if (isButtonPressed()) {
            return pressedContentColor;
        }
        return contentColor;
    }

    function getBackgroundColor() {
        if (disabled) {
            return disabledBackgroundColor;
        }
        if (isButtonPressed()) {
            return pressedBackgroundColor;
        }
        return backgroundColor;
    }

    const buttonStyle = {
        ...styles.button,
        padding: size === buttonSizes.SMALL ? '8px' : '16px',
        height: `${getButtonHeightBySize(size)}px`,
        backgroundColor: getBackgroundColor(),
        borderWidth: hasBorder ? '1px' : '0',
        borderStyle: 'solid',
        borderColor: getContentColor(),
        boxShadow: disabled ? 'none' : `0px 2px 6px ${shadowColor}`,
        ...customStyle,
    };

    const textStyle = {
        ...styles.text,
        fontFamily: 'Fredoka', // Font family
        color: getContentColor(),
        fontSize: size === buttonSizes.SMALL ? '12px' : '14px',
    };

    return (
        <TextButtonWithTwoOptionalIcons
            {...props}
            ref={ref} // Forward the ref to TextButtonWithTwoOptionalIcons
            onMouseDown={handlePressIn}
            onMouseUp={handlePressOut}
            onPress={handlePress}
            style={buttonStyle}
            textStyle={textStyle}
            leftIcon={isProcessing ? null : leftIcon}
            leftIconSize={ICON_SIZE}
            leftIconTintColor={getContentColor()}
            rightIcon={isProcessing ? null : rightIcon}
            rightIconSize={ICON_SIZE}
            rightIconTintColor={getContentColor()}
        >
            {isProcessing ? <SimpleLoader color={getContentColor()} /> : children}
        </TextButtonWithTwoOptionalIcons>
    );
});

const styles = {
    button: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '130px',
        width: 'auto',
    },
    text: {
        textAlign: 'center',
        margin: '0 4px',
        fontFamily: 'Fredoka-Regular',
    },
};

function getButtonHeightBySize(buttonSize) {
    switch (buttonSize) {
        case buttonSizes.LARGE:
            return 40;
        case buttonSizes.MEDIUM:
            return 32;
        case buttonSizes.SMALL:
            return 24;
        default:
            return 40;
    }
}

export default GenericButton;
