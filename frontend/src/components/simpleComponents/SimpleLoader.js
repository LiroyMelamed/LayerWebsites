import React from 'react';
import SimpleContainer from './SimpleContainer';
import { colors } from '../../constant/colors';

const SimpleLoader = ({style}) => {
    // Styles for the loader container
    const loaderStyle = {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%', // Full viewport height
        width: '100%', // Full width
        backgroundColor: colors.transparent, // Optional background color
        top: 0,
        left: 0,
        zIndex: 1000, // Ensure it's above other content
        ...style
    };

    // Styles for the dots
    const dotStyle = {
        width:8,
        height: 8,
        backgroundColor: colors.text, // Blue color for the dots
        borderRadius: '50%',
        margin: '0 5px',
        opacity: 0,
        animation: 'dotPulse 1.5s infinite ease-in-out',
    };

    // Keyframes for the dot animation
    const keyframes = `
        @keyframes dotPulse {
            0%, 80%, 100% {
                opacity: 0;
            }
            40% {
                opacity: 1;
            }
        }
    `;

    return (
        <>
            <style>{keyframes}</style>
            <SimpleContainer style={loaderStyle}>
                <SimpleContainer style={{ ...dotStyle, animationDelay: '0s' }} />
                <SimpleContainer style={{ ...dotStyle, animationDelay: '0.3s' }} />
                <SimpleContainer style={{ ...dotStyle, animationDelay: '0.6s' }} />
            </SimpleContainer>
        </>
    );
};

export default SimpleLoader;
