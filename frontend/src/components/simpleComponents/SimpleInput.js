import React, { forwardRef, useState, useEffect } from 'react';
import SimpleContainer from './SimpleContainer';
import { colors } from '../../constant/colors';
import SimpleIcon from './SimpleIcon';

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

        timeToWaitInMilli = 500,
        ...props
    }, ref) => {
        const [isFocused, setIsFocused] = useState(false);
        const [delayedValue, setDelayedValue] = useState(value);
        const [timeoutId, setTimeoutId] = useState(null);

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
            onFocus?.();
            setIsFocused(true);
        }

        const handleInputChange = (e) => {
            const newValue = e.target.value;
            setDelayedValue(newValue);

            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            const newTimeoutId = setTimeout(() => {
                onChange?.(e);
                setTimeoutId(null);
            }, timeToWaitInMilli);

            setTimeoutId(newTimeoutId);
        };

        useEffect(() => {
            setDelayedValue(value);
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }, [value]);

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
                    marginTop: 8,
                    boxShadow: isFocused ? '0 0 8px rgba(59,130,246,0.12)' : 'none',
                    direction: 'rtl',
                    height: sizeStyles.height,
                    width: '100%',
                    ...style,
                }}
            >
                {title && (
                    <span
                        style={{
                            ...styles.floatingLabel,
                            fontSize: titleFontSize,
                            fontFamily: 'inherit',
                            right: rightIcon ? '40px' : '8px',
                            top: sizeStyles.labelTop,
                            borderRadius: 10000,
                            transform: isFocused || delayedValue ? sizeStyles.transformFocused : 'translateY(-50%)',
                            opacity: isFocused || delayedValue ? 1 : 0.6,
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
                        width: '100%',
                        minWidth: '0',
                        padding: leftIcon ? `8px ${sizeStyles.padding} 8px 10px` : sizeStyles.padding,
                        paddingRight: rightIcon ? '30px' : sizeStyles.padding,
                        border: 'none',
                        fontFamily: 'inherit',
                        backgroundColor: 'transparent',
                        outline: 'none',
                        fontSize: sizeStyles.fontSize,
                        color: disabled ? colors.disabled : colors.text,
                        textAlign: 'right',
                        ...textStyle,
                    }}
                    value={delayedValue}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
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