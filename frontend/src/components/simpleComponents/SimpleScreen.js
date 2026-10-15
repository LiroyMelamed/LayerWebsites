import React from 'react';
import SimpleContainer from './SimpleContainer';
import SimpleImage from './SimpleImage';

import './SimpleScreen.scss';

export default function SimpleScreen({
    children,
    imageBackgroundSource,
    className,
    contentClassName,
    ...rest
}) {

    const resolvedScreenClassName = ['lw-simpleScreen', className].filter(Boolean).join(' ');
    const resolvedContentClassName = ['lw-simpleScreen__content', contentClassName].filter(Boolean).join(' ');

    return (
        <SimpleContainer className={resolvedScreenClassName} {...rest}>
            {imageBackgroundSource && (
                <SimpleImage
                    className="lw-simpleScreen__bg"
                    src={imageBackgroundSource}
                    alt=""
                />
            )}
            <SimpleContainer className={resolvedContentClassName}>
                {children}
            </SimpleContainer>
        </SimpleContainer>
    );
}
