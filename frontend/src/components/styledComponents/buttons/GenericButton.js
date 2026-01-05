import React, { useEffect, useRef, useState, forwardRef } from "react";
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

    const buttonRef = useRef(null);
    const setButtonRefs = (node) => {
        buttonRef.current = node;
        if (typeof ref === 'function') {
            ref(node);
        } else if (ref) {
            ref.current = node;
        }
    };

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

    useEffect(() => {
        if (!buttonRef.current) return;

        // runtime dynamic: button visuals depend on props + pressed/disabled state
        const nextStyle = {
            padding: size === buttonSizes.SMALL ? '0.4rem 0.5rem' : '0.8rem 1rem',
            height: `${getButtonHeightBySize(size)}px`,
            backgroundColor: getBackgroundColor(),
            borderWidth: hasBorder ? '1px' : '0',
            borderStyle: 'solid',
            borderColor: getContentColor(),
            boxShadow: disabled ? 'none' : '0 2px 4px rgba(0,0,0,0.1)',
            transform: isButtonPressed() ? 'scale(0.98)' : 'scale(1)',
            borderRadius: '8px',
            fontWeight: 500,
            ...(customStyle || {}),
        };

        Object.assign(buttonRef.current.style, nextStyle);
    }, [
        size,
        disabled,
        hasBorder,
        holdPressed,
        isPressed,
        backgroundColor,
        pressedBackgroundColor,
        disabledBackgroundColor,
        contentColor,
        pressedContentColor,
        disabledContentColor,
        shadowColor,
        isPerforming,
        customStyle,
    ]);

    return (
        <TextButtonWithTwoOptionalIcons
            {...props}
            ref={setButtonRefs} // Forward the ref to TextButtonWithTwoOptionalIcons
            onMouseDown={handlePressIn}
            onMouseUp={handlePressOut}
            onPress={handlePress}
            textColor={getContentColor()}
            textSize={size === buttonSizes.SMALL ? 12 : 14}
            textBold
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
