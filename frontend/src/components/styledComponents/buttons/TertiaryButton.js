import React from "react";
import GenericButton from "./GenericButton";
import { colors } from "../../../constant/colors";

const backgroundColor = {
    normal: colors.transparent,
    pressed: colors.secondaryHighlighted,
    disabled: colors.transparent
}

const contentColor = {
    normal: colors.primaryHighlighted,
    pressed: colors.primaryHighlighted,
    disabled: colors.disabledHighlighted,
}

export default function TertiaryButton({ children, size, rightIcon, leftIcon, innerTextColor, ...props }) {
    return (
        <GenericButton
            {...props}
            size={size}
            rightIcon={rightIcon}
            leftIcon={leftIcon}
            backgroundColor={backgroundColor.normal}
            pressedBackgroundColor={backgroundColor.pressed}
            disabledBackgroundColor={backgroundColor.disabled}
            contentColor={innerTextColor || contentColor.normal}
            pressedContentColor={contentColor.pressed}
            disabledContentColor={contentColor.disabled}
        >
            {children}
        </GenericButton>
    );
}
