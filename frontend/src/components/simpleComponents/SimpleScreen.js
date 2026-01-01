import React from 'react';
import { useScreenSize } from '../../providers/ScreenSizeProvider';
import SimpleContainer from './SimpleContainer';

export default function SimpleScreen({
    children,
    imageBackgroundSource,
    style,
    screenStyle: customScreenStyle,
    className,
    contentClassName,
    ...rest
}) {
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
        width: isSmallScreen ? '100%' : 'calc(100% - 250px)',
        marginRight: isSmallScreen ? '0' : '250px',
        alignItems: isSmallScreen ? 'center' : 'flex-end',
        boxSizing: "border-box",
        flexDirection: "column",
        ...style,
    };

    return (
        <SimpleContainer className={className} style={screenStyle} {...rest}>
            <SimpleContainer className={contentClassName} style={childrenContainerStyle}>
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