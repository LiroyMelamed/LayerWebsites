import React, { forwardRef, useState } from 'react';
import SimpleContainer from './SimpleContainer';
import SimpleIcon from './SimpleIcon';
import { colors } from '../../constant/colors';
import ErrorText from '../styledComponents/text/ErrorText';

const SimpleInput = forwardRef(
    ({
        title,
        titleFontSize = 16,
        leftIcon,
        rightIcon,
        tintColor,
        IconStyle,
        textStyle,
        style,
        value,
        onChange,
        inputSize = 'Medium',
        disabled = false,
        onFocus,
        onBlur,
        error,
        ...props
    }, ref) => {
        const [isFocused, setIsFocused] = useState(false);

        const sizeStyles = inputStyles[inputSize];

        function getBorderColor() {
            if (disabled) return colors.disabledHighlighted;
            if (error) return colors.error;
            return isFocused ? colors.primaryHighlighted : colors.secondaryHighlighted;
        }

        function getBackgroundColor() {
            return disabled ? colors.disabled : colors.white;
        }

        function handleFocus() {
            onFocus?.()
            setIsFocused(true)
        }

        function handleBlur(event) {
            onBlur?.(event)
            setIsFocused(false)
        }

        return (
            <SimpleContainer
                ref={ref}
                style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    border: `1px solid ${getBorderColor()}`,
                    backgroundColor: getBackgroundColor(),
                    borderRadius: 12,
                    margin: '8px',
                    boxShadow: isFocused ? '0 0 4px rgba(0, 0, 0, 0.2)' : 'none',
                    direction: 'rtl',
                    height: sizeStyles.height,
                    ...style,
                }}
            >
                {title && (
                    <span
                        style={{
                            ...styles.floatingLabel,
                            fontSize: titleFontSize,
                            fontFamily: 'Fredoka', // Ensures font is Fredoka for the input field
                            right: rightIcon ? '40px' : '8px',
                            top: sizeStyles.labelTop,
                            borderRadius: 10000,
                            transform: isFocused || value ? sizeStyles.transformFocused : 'translateY(-50%)',
                            opacity: isFocused || value ? 1 : 0.6,
                            color: error ? colors.error : colors.primaryHighlighted,
                        }}
                    >
                        {error || title}
                    </span>
                )}

                {rightIcon && (
                    <SimpleIcon
                        tintColor={tintColor || getBorderColor()}
                        src={rightIcon}
                        style={{ ...IconStyle, marginRight: '8px' }}
                    />
                )}

                <input
                    type="text"
                    style={{
                        flexGrow: 1, // Allows input to resize inside containers
                        width: '100%', // Ensures input fills its container
                        minWidth: '0', // Prevents the input from forcing a larger width
                        padding: leftIcon ? `8px ${sizeStyles.padding} 8px 10px` : sizeStyles.padding,
                        paddingRight: rightIcon ? '30px' : sizeStyles.padding,
                        border: 'none',
                        fontFamily: 'Fredoka',
                        backgroundColor: 'transparent',
                        outline: 'none',
                        fontSize: sizeStyles.fontSize,
                        color: disabled ? colors.disabledText : colors.text,
                        textAlign: 'right',
                        ...textStyle,
                    }}

                    value={value}
                    onChange={onChange}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    disabled={disabled}
                    {...props}
                />

                {leftIcon && (
                    <SimpleIcon
                        tintColor={tintColor || getBorderColor()}
                        src={leftIcon}
                        style={{ ...IconStyle, marginLeft: '8px' }}
                    />
                )}

            </SimpleContainer>

        );
    }
);

const styles = {
    floatingLabel: {
        position: 'absolute',
        backgroundColor: colors.white,
        padding: '0 0px',
        pointerEvents: 'none',
        transition: 'top 0.2s ease, transform 0.2s ease, opacity 0.2s ease',
    },
};

export default SimpleInput;

export const inputSize = {
    SMALL: "Small",
    MEDIUM: "Medium",
    BIG: "Big"
};

export const inputStyles = {
    Small: {
        height: 24,
        fontSize: 12,
        padding: '8px',
        labelTop: '50%',
        borderStyle: 'solid',
        transformFocused: 'translateY(-100%) scale(0.7)',
    },
    Medium: {
        height: 32,
        fontSize: 16,
        padding: '16px',
        labelTop: '50%',
        borderStyle: 'solid',
        transformFocused: 'translateY(-150%) scale(0.7)',
    },
    Big: {
        height: 40,
        fontSize: 24,
        padding: '16px',
        labelTop: '50%',
        transformFocused: 'translateY(-150%) scale(0.7)',
    },
};
