import React from 'react';
import SimpleContainer from './SimpleContainer';

import './SimpleScreen.scss';

export default function SimpleScreen({
    children,
    imageBackgroundSource,
    screenStyle: customScreenStyle,
    className,
    contentClassName,
    ...rest
}) {

    // Runtime background image; everything else is handled via SCSS.
    const backgroundStyle = imageBackgroundSource
        ? { backgroundImage: `url(${imageBackgroundSource})` }
        : undefined;

    const mergedScreenStyle = customScreenStyle
        ? { ...backgroundStyle, ...customScreenStyle }
        : backgroundStyle;

    const resolvedScreenClassName = ['lw-simpleScreen', className].filter(Boolean).join(' ');
    const resolvedContentClassName = ['lw-simpleScreen__content', contentClassName].filter(Boolean).join(' ');

    return (
        <SimpleContainer className={resolvedScreenClassName} style={mergedScreenStyle} {...rest}>
            <SimpleContainer className={resolvedContentClassName}>
                {children}
            </SimpleContainer>
        </SimpleContainer>
    );
}
