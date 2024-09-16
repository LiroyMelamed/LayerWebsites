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
        height: '100dvh',
        width: '100dvw',
        position: 'relative',
    },
    childrenContainer: {
        display: 'flex',
        position: 'relative',
        zIndex: 1,
    },
};