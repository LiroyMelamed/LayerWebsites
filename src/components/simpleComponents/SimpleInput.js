import React, { forwardRef, useState } from 'react';
import SimpleContainer from './SimpleContainer';
import SimpleIcon from './SimpleIcon';
import { colors } from '../../constant/colors';

const SimpleInput = forwardRef(
    ({ title, titleFontSize = 16, leftIcon, rightIcon, tintColor, IconStyle, textStyle, style, value, onChange, inputSize = 'Medium', ...props }, ref) => {
        const [isFocused, setIsFocused] = useState(false);

        const sizeStyles = inputStyles[inputSize]; // Select the styles based on inputSize prop

        return (
            <SimpleContainer
                ref={ref}
                style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    border: '1px solid #ddd',
                    backgroundColor: '#f8f8f8',
                    borderRadius: '25px',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                    direction: 'rtl',
                    height: sizeStyles.height, // Apply the height based on inputSize
                    ...style,
                }}
            >
                {title && (
                    <span
                        style={{
                            ...styles.floatingLabel,
                            fontSize: titleFontSize,
                            right: rightIcon ? '40px' : '15px', // Adjust position based on the presence of rightIcon
                            top: sizeStyles.labelTop, // Use the top property from inputStyles
                            transform: isFocused || value ? sizeStyles.transformFocused : 'translateY(-50%)', // Center the label when not focused
                            opacity: isFocused || value ? 1 : 0.6,
                        }}
                    >
                        {title}
                    </span>
                )}

                {rightIcon && (
                    <SimpleIcon
                        tintColor={tintColor}
                        src={rightIcon}
                        style={{ ...IconStyle, marginRight: '8px' }}
                    />
                )}
                <input
                    type="text"
                    style={{
                        flex: 1,
                        padding: leftIcon ? `20px ${sizeStyles.padding} 10px 10px` : sizeStyles.padding,
                        paddingRight: rightIcon ? '30px' : sizeStyles.padding,
                        border: 'none',
                        backgroundColor: 'transparent',
                        outline: 'none',
                        fontSize: sizeStyles.fontSize, // Apply fontSize based on inputSize
                        color: '#666',
                        direction: 'rtl',
                        textAlign: 'right',
                        minWidth: '0',
                        ...textStyle,
                    }}
                    value={value}
                    onChange={onChange}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    {...props}
                />
                {leftIcon && (
                    <SimpleIcon
                        tintColor={tintColor}
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
        backgroundColor: '#f8f8f8',
        padding: '0 5px',
        pointerEvents: 'none',
        transition: 'top 0.2s ease, transform 0.2s ease, opacity 0.2s ease',
        color: colors.text,
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
        padding: '8px 12px',
        labelTop: '50%', // Vertically center the label
        transformFocused: 'translateY(-150%) scale(0.8)', // Adjusted transform for focused state
    },
    Medium: {
        height: 40,
        fontSize: 16,
        padding: '10px 20px',
        labelTop: '50%', // Vertically center the label
        transformFocused: 'translateY(-150%) scale(0.8)', // Adjusted transform for focused state
    },
    Big: {
        height: 60,
        fontSize: 24,
        padding: '12px 28px',
        labelTop: '50%', // Vertically center the label
        transformFocused: 'translateY(-150%) scale(0.8)', // Adjusted transform for focused state
    },
};