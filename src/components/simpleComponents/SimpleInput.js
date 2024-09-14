import React, { forwardRef } from 'react';
import SimpleContainer from './SimpleContainer';
import SimpleIcon from './SimpleIcon';

const SimpleInput = forwardRef(({ leftIcon, rightIcon, tintColor, IconStyle, textStyle, style, ...props }, ref) => {

    const TextStyle = {
        fontFamily: 'Rubik, sans-serif',
        fontSize: 24,
        ...textStyle
    }

    return (
        <SimpleContainer
            ref={ref}
            style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                border: '1px solid #ddd',
                backgroundColor: '#f8f8f8', // Light background color
                borderRadius: '25px', // Rounded corners
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)', // Soft shadow
                width: '100%', // Adjust width
                direction: 'rtl', // Support RTL text direction
                ...style,
            }}
        >
            {rightIcon && (
                <SimpleIcon
                    tintColor={tintColor}
                    src={rightIcon}
                    style={{ ...IconStyle, marginRight: '8px' }} // Adjust margin for RTL
                />
            )}
            <input
                type="text"
                style={{
                    flex: 1,
                    padding: leftIcon ? '10px 30px 10px 10px' : '10px 15px', // Adjust padding for RTL
                    paddingRight: rightIcon ? '30px' : '15px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    outline: 'none',
                    fontSize: '14px', // Font size
                    color: '#666', // Text color
                    direction: 'rtl', // Support RTL text direction
                    textAlign: 'right', // Align text to the right for RTL
                    ...TextStyle, // Apply text styles from props
                }}
                {...props}
            />
            {leftIcon && (
                <SimpleIcon
                    tintColor={tintColor}
                    src={leftIcon}
                    style={{ ...IconStyle, marginLeft: '8px' }} // Adjust margin for RTL
                />
            )}

        </SimpleContainer>
    );
});

export default SimpleInput;
