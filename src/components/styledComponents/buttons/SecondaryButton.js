import React, { useState, forwardRef } from 'react';
import ButtonWithIcons from '../../specializedComponents/buttons/ButtonWithIcons';
import { buttonStyles } from '../../simpleComponents/SimpleButton';
import SimpleLoader from '../../simpleComponents/SimpleLoader'; // Import SimpleLoader

const SecondaryButton = forwardRef(({ onClick, children, leftIcon, rightIcon, buttonSize = "Medium", textStyle, style, isPerforming, ...props }, ref) => {
    const [isPressed, setIsPressed] = useState(false);

    const handleMouseDown = () => setIsPressed(true);
    const handleMouseUp = () => setIsPressed(false);
    const handleTouchStart = () => setIsPressed(true);
    const handleTouchEnd = () => setIsPressed(false);

    const styles = {
        button: {
            padding: '10px 20px',
            border: '2px solid #ccc',
            borderRadius: '15px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease-in-out',
            boxShadow: '4px 4px 8px #d0d0d0, -4px -4px 8px #ffffff',
            ...buttonStyles[buttonSize],
        },
        buttonNotPressed: {
            backgroundColor: '#f0f0f0',
            color: '#333',
        },
        buttonPressed: {
            backgroundColor: '#e0e0e0',
            boxShadow: '2px 2px 4px #d0d0d0, -2px -2px 4px #ffffff',
        },
    };

    const IconStyle = {
        width: buttonStyles[buttonSize].iconSize,
        height: buttonStyles[buttonSize].iconSize,
    };

    const TextStyle = {
        fontSize: buttonStyles[buttonSize].fontSize,
        ...textStyle,
    };

    return (
        <ButtonWithIcons
            ref={ref} // Pass the ref to ButtonWithIcons
            onClick={onClick}
            leftIcon={leftIcon}
            rightIcon={rightIcon}
            iconStyle={IconStyle}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            textStyle={TextStyle}
            style={{
                ...styles.button,
                ...(isPressed ? styles.buttonPressed : styles.buttonNotPressed),
                ...style,
            }}
            {...props}
        >
            {isPerforming ? <SimpleLoader /> : children}
        </ButtonWithIcons>
    );
});

export default SecondaryButton;
