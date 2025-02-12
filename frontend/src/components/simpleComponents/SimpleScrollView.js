import React, { forwardRef } from "react";
import { colors } from "../../constant/colors";

const SimpleScrollView = forwardRef(({
    children,
    onScroll,
    style,
    ...props
}, ref) => {
    return (
        <div
            {...props}
            onScroll={onScroll}
            ref={ref}
            style={{
                backgroundColor: colors.transparent,
                width: '100%',
                overflowY: 'auto',
                msOverflowStyle: 'none',
                scrollbarWidth: 'none',
                ...style,
            }}
        >
            <style>
                {`
                    div::-webkit-scrollbar {
                        display: none;
                    }
                `}
            </style>
            {children}
        </div>
    );
});

export default SimpleScrollView;
