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
                overflowY: 'auto', // Enable vertical scrolling
                msOverflowStyle: 'none', // Hide scrollbar on Internet Explorer
                scrollbarWidth: 'none', // Hide scrollbar on Firefox
                ...style,
            }}
        >
            {/* Hide scrollbar on Webkit browsers */}
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
