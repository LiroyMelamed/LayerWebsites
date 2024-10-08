import React from 'react';
import { colors } from '../../../constant/colors';
import GenericButton from './GenericButton';

const backgroundColor = {
    normal: colors.secondary,
    pressed: colors.secondaryHighlighted,
    disabled: colors.transparent,
};

const contentColor = {
    normal: colors.primaryHighlighted,
    pressed: colors.primaryHighlighted,
    disabled: colors.disabledHighlighted,
};

export default function SecondaryButton({ children, size, rightIcon, leftIcon, ...props }) {
    const buttonStyle = {
        ...styles.button,
        ...props.style,
    };

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
            hasBorder={true}
        >
            {children}
        </GenericButton>
    );
}

const styles = {
    button: {
        borderRadius: '130px',
        border: `1px solid ${colors.primaryHighlighted}`,
        background: colors.secondary,
    },
};
