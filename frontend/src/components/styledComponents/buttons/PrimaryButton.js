import { colors } from "../../../constant/colors";
import React from "react";
import GenericButton from "./GenericButton";

const backgroundColor = {
    normal: colors.primary,
    pressed: colors.primaryHighlighted,
    disabled: colors.disabled,
}

const contentColor = {
    normal: colors.secondary,
    pressed: colors.secondary,
    disabled: colors.disabledHighlighted,
}

export default function PrimaryButton({ children, size, rightIcon, leftIcon, ...props }) {
    const buttonStyle = {
        ...style,
        ...props.style,
    }

    return (
        <GenericButton
            {...props}

            size={size}
            style={buttonStyle}
            rightIcon={rightIcon}
            leftIcon={leftIcon}

            backgroundColor={backgroundColor.normal}
            pressedBackgroundColor={backgroundColor.pressed}
            disabledBackgroundColor={backgroundColor.disabled}

            contentColor={contentColor.normal}
            pressedContentColor={contentColor.pressed}
            disabledContentColor={contentColor.disabled}
        >
            {children}
        </GenericButton>
    );
}

const style = {
    shadowColor: colors.primary,
}
