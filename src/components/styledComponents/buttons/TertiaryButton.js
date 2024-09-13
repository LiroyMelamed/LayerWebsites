import React, { useState } from 'react';
import ButtonWithIcons from '../../specializedComponents/buttons/ButtonWithIcons';
import { buttonStyles } from '../../simpleComponents/SimpleButton';

const TertiaryButton = ({ onClick, children, leftIcon, rightIcon, iconSize, tintColor, buttonSize = "Medium", style, ...props }) => {
    const [isPressed, setIsPressed] = useState(false);

    const handleMouseDown = () => setIsPressed(true);
    const handleMouseUp = () => {
        setIsPressed(false);
        if (onClick) onClick(); // Call onClick handler when mouse is released
    };
    const handleTouchStart = () => setIsPressed(true);
    const handleTouchEnd = () => {
        setIsPressed(false);
        if (onClick) onClick(); // Call onClick handler on touch end
    };

    const styles = {
        button: {
            padding: '10px 20px',
            border: '0px solid #aaa', // Light border
            borderRadius: '15px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'normal', // Regular font weight
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease-in-out',
            ...buttonStyles[buttonSize]
        },
        buttonNotPressed: {
            backgroundColor: 'transparent', // Transparent background
            color: '#555',
        },
        buttonPressed: {
            backgroundColor: '#f0f0f0',
            borderColor: '#888',
        },
    };

    const IconStyle = {
        width: buttonStyles[buttonSize].iconSize,
        height: buttonStyles[buttonSize].iconSize
    }

    return (
        <ButtonWithIcons
            leftIcon={leftIcon}
            rightIcon={rightIcon}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            iconStyle={IconStyle}
            tintColor={tintColor}
            style={{
                ...styles.button,
                ...(isPressed ? styles.buttonPressed : styles.buttonNotPressed),
                ...style,
            }}
            {...props}
        >
            {children}
        </ButtonWithIcons>
    );
};

export default TertiaryButton;
