import React, { useEffect, useState } from 'react';
import ButtonWithIcons from '../../specializedComponents/buttons/ButtonWithIcons';
import colors from '../../../constant/colors';

const PrimaryButton = ({ onClick, children, leftIcon, rightIcon, style, ...props }) => {
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
            border: 'none',
            borderRadius: '15px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease-in-out',
            boxShadow: '8px 8px 15px #d0d0d0, -8px -8px 15px #ffffff',
        },
        buttonNotPressed: {
            backgroundColor: '#e0e0e0',
            color: '#333',
        },
        buttonPressed: {
            backgroundColor: '#d0d0d0',
            boxShadow: '4px 4px 8px #d0d0d0, -4px -4px 8px #ffffff',
        },
        icon: {
            width: '20px',
            height: '20px',
        },
    };

    useEffect(() => {
        console.log("isPressed", isPressed);
    }, [isPressed])

    return (
        <ButtonWithIcons
            leftIcon={leftIcon}
            rightIcon={rightIcon}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
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

export default PrimaryButton;
