import React, { forwardRef } from "react";

import './SimpleScrollView.scss';

const SimpleScrollView = forwardRef(({
    children,
    onScroll,
    style,
    className,
    ...props
}, ref) => {
    return React.createElement(
        'div',
        {
            ...props,
            onScroll,
            ref,
            className: ['lw-simpleScrollView', className].filter(Boolean).join(' '),
            style,
        },
        children
    );
});

export default SimpleScrollView;
