import React, { forwardRef } from 'react';
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

// Use forwardRef to forward the ref to the GenericButton
const SecondaryButton = forwardRef(({ children, size, rightIcon, leftIcon, ...props }, ref) => {
    const buttonStyle = {
        ...styles.button,
        ...props.style,
    };

    return (
        <GenericButton
            {...props}
            ref={ref} // Forward the ref here
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
});

const styles = {
    button: {
        borderRadius: '130px',
        border: `1px solid ${colors.primaryHighlighted}`,
        background: colors.secondary,
    },
};

export default SecondaryButton;
