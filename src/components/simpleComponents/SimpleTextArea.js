import React, { forwardRef, useState } from 'react';
import SimpleContainer from './SimpleContainer';
import SimpleIcon from './SimpleIcon';
import { colors } from '../../constant/colors';

const SimpleTextArea = forwardRef(({ title, leftIcon, rightIcon, tintColor, IconStyle, textStyle, style, value, onChange, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false);

    const TextStyle = {
        fontSize: 24,
        ...textStyle,
    };

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
                width: '100%',
                direction: 'rtl',
                ...style,
            }}
        >
            {/* Floating label */}
            {title && (
                <span
                    style={{
                        ...styles.floatingLabel,
                        transform: value || isFocused ? 'translateY(-20px) scale(0.8)' : 'translateY(10px) scale(1)',
                        opacity: value || isFocused ? 1 : 0.6,
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
            <textarea
                type="text"
                style={{
                    flex: 1,
                    padding: leftIcon ? '20px 30px 10px 10px' : '20px 15px', // Adjust padding for better spacing
                    paddingRight: rightIcon ? '30px' : '15px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    outline: 'none',
                    fontSize: '14px',
                    color: '#666',
                    direction: 'rtl',
                    textAlign: 'right',
                    ...TextStyle,
                }}
                value={value}
                onChange={(e) => onChange(e.target.value)} // Directly return the text value
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
});

const styles = {
    floatingLabel: {
        position: 'absolute',
        top: '12px', // Adjust to position label correctly when not focused
        right: '15px',
        fontSize: '16px',
        color: colors.text,
        backgroundColor: '#f8f8f8', // Match the container's background
        padding: '0 5px',
        pointerEvents: 'none',
        transition: 'transform 0.2s ease, opacity 0.2s ease',
    },
};

export default SimpleTextArea;
