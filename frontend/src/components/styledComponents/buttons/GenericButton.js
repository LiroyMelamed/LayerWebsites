import React, { useState, forwardRef } from "react";
import { buttonSizes } from "../../../styles/buttons/buttonSizes";
import { colors } from "../../../constant/colors";
import SimpleLoader from "../../simpleComponents/SimpleLoader";
import TextButtonWithTwoOptionalIcons from "../../specializedComponents/buttons/TextButtonWithTwoOptionalIcons";


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
    isPerforming = false,
    style: customStyle = {},
    ...props
}, ref) => {

    const ICON_SIZE = size == buttonSizes.SMALL ? 8 : 12;

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
        return !disabled && !isPerforming;
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
        padding: size === buttonSizes.SMALL ? '0.4rem 0.5rem' : '0.8rem 1rem',
        height: `${getButtonHeightBySize(size)}px`,
        backgroundColor: getBackgroundColor(),
        borderWidth: hasBorder ? '1px' : '0',
        borderStyle: 'solid',
        borderColor: getContentColor(),
        boxShadow: disabled ? 'none' : '0 2px 4px rgba(0,0,0,0.1)',
        transition: 'all 0.2s ease',
        transform: isButtonPressed() ? 'scale(0.98)' : 'scale(1)',
        borderRadius: '8px',
        fontWeight: 500,
        ...customStyle,
    };

    const textStyle = {
        ...styles.text,
        fontFamily: 'inherit', // inherit global font
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
            leftIcon={isPerforming ? null : leftIcon}
            leftIconSize={ICON_SIZE}
            leftIconTintColor={getContentColor()}
            rightIcon={isPerforming ? null : rightIcon}
            rightIconSize={ICON_SIZE}
            rightIconTintColor={getContentColor()}
        >
            {isPerforming ? <SimpleLoader color={getContentColor()} /> : children}
        </TextButtonWithTwoOptionalIcons>
    );
});

const styles = {
    button: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '12px',
        width: 'auto',
    },
    text: {
        textAlign: 'center',
        margin: '0 4px',
        fontFamily: 'inherit',
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
