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
        width: isSmallScreen ? '100%' : `calc(100% - 250px)`,
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
        height: '100%',
        width: '100%',
        position: 'relative',
        transition: 'width 0.3s ease', // Smooth transition for resizing\
    },
    childrenContainer: {
        display: 'flex',
        position: 'relative',
        height: '100dvh',
        zIndex: 1,
    },
};