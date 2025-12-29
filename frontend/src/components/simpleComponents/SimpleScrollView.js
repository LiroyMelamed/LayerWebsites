import React, { forwardRef } from "react";

import './SimpleScrollView.scss';

const SimpleScrollView = forwardRef(({
    children,
    onScroll,
    style,
    className,
    ...props
}, ref) => {
    return (
        <div
            {...props}
            onScroll={onScroll}
            ref={ref}
            className={['lw-simpleScrollView', className].filter(Boolean).join(' ')}
            style={style}
        >
            {children}
        </div>
    );
});

export default SimpleScrollView;
