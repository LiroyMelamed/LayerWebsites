import React from 'react';
import { useScreenSize } from '../../providers/ScreenSizeProvider';
import SimpleContainer from './SimpleContainer';

export default function SimpleScreen({ children, imageBackgroundSource, style }) {
    const { isSmallScreen } = useScreenSize();

    const screenStyle = {
        ...styles.screen,
        backgroundImage: `url(${imageBackgroundSource})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
    };

    const childrenContainerStyle = {
        ...style,
        ...styles.childrenContainer,
        maxWidth: isSmallScreen ? '100dvw' : `calc(100dvw - 250px)`,
    };

    return (
        <SimpleContainer style={screenStyle}>
            <SimpleContainer style={childrenContainerStyle}>
                {children}
            </SimpleContainer>
        </SimpleContainer>
    );
}

const styles = {
    screen: {
        display: 'flex',
        height: '100dvh',
        position: 'relative',
        transition: 'width 0.3s ease', // Smooth transition for resizing
    },
    childrenContainer: {
        display: 'flex',
        justifyContent: 'center', // Center content horizontally inside container
        alignItems: 'center', // Center content vertically inside container
        position: 'relative',
        zIndex: 1,
    },
};