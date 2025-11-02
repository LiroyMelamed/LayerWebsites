import React from 'react';
import { useScreenSize } from '../../providers/ScreenSizeProvider';
import SimpleContainer from './SimpleContainer';

export default function SimpleScreen({ children, imageBackgroundSource, style, screenStyle: customScreenStyle }) {
    const { isSmallScreen } = useScreenSize();

    const screenStyle = {
        ...styles.screen,
        ...customScreenStyle,
    };

    if (imageBackgroundSource) {
        screenStyle.backgroundImage = `url(${imageBackgroundSource})`;
        screenStyle.backgroundSize = 'cover';
        screenStyle.backgroundPosition = 'center';
    };

    const childrenContainerStyle = {
        ...styles.childrenContainer,
        width: isSmallScreen ? '100%' : `calc(100% - 250px)`,
        ...style,
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
        flexDirection: 'row',
        height: '100svh',
        width: '100%',
        position: 'relative',
    },
    childrenContainer: {
    },
};