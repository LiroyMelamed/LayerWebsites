import React, { forwardRef, useState } from 'react';
import SimpleContainer from './SimpleContainer';
import SimpleIcon from './SimpleIcon';
import { colors } from '../../constant/colors';

const SimpleTextArea = forwardRef(
    ({
        title,
        leftIcon,
        rightIcon,
        tintColor,
        IconStyle,
        textStyle,
        style,
        value,
        onChange,
        disabled = false,
        error = '',
        ...props
    }, ref) => {
        const [isFocused, setIsFocused] = useState(false);

        // Dynamic styles for text area
        function getBorderColor() {
            if (disabled) return colors.disabledHighlighted;
            if (error) return colors.error;
            return isFocused ? colors.primaryHighlighted : colors.secondaryHighlighted;
        }

        function getBackgroundColor() {
            return disabled ? colors.disabled : colors.white;
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
                    padding: '12px',
                    boxShadow: isFocused ? '0 0 4px rgba(0, 0, 0, 0.2)' : 'none',
                    direction: 'rtl',
                    width: '100%',
                    ...style,
                }}
            >
                {/* Floating Label */}
                {title && (
                    <span
                        style={{
                            ...styles.floatingLabel,
                            transform: isFocused || value ? 'translateY(-20px) scale(0.8)' : 'translateY(10px) scale(1)',
                            opacity: isFocused || value ? 1 : 0.6,
                            color: error ? colors.error : colors.primaryHighlighted,
                            fontFamily: 'inherit', // use global font
                            borderRadius: 10000,
                        }}
                    >
                        {title}
                    </span>
                )}

                {rightIcon && (
                    <SimpleIcon
                        tintColor={tintColor || getBorderColor()}
                        src={rightIcon}
                        style={{ ...IconStyle, marginRight: '8px' }}
                    />
                )}

                <style>
                    {`
                        textarea::-webkit-scrollbar {
                            width: 8px;
                            height: 8px;
                        }
                        textarea::-webkit-scrollbar-thumb {
                            background-color: rgba(0, 0, 0, 0.4);
                            border-radius: 8px;
                        }
                        textarea::-webkit-scrollbar-thumb:hover {
                            background-color: rgba(0, 0, 0, 0.6);
                        }
                        textarea::-webkit-scrollbar-track {
                            background-color: rgba(0, 0, 0, 0.1);
                            border-radius: 8px;
                        }
                    `}
                </style>

                <textarea
                    style={{
                        flex: 1,
                        padding: leftIcon ? '0px 0px 10px 10px' : '0px 15px',
                        paddingRight: rightIcon ? '30px' : '15px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        outline: 'none',
                        fontSize: '14px',
                        fontFamily: 'inherit', // use global font
                        color: disabled ? colors.disabledText : colors.text,
                        direction: 'rtl',
                        textAlign: 'right',
                        ...textStyle,
                    }}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
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
        top: '12px',
        right: '15px',
        fontSize: '16px',
        color: colors.text,
        backgroundColor: colors.white,
        padding: '0 5px',
        pointerEvents: 'none',
        transition: 'transform 0.2s ease, opacity 0.2s ease',
    },
};

export default SimpleTextArea;
