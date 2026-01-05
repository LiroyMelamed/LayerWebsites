import React from 'react';
import { colors } from '../../constant/colors';

import './SimpleText.scss';

const SimpleText = ({
    size = 16,
    bold = false,
    color = colors.text,
    children,
    style,
    className,
    ...props
}) => {
    const cssVars = {
        '--lw-simpleText-size': `${size / 16}rem`,
        '--lw-simpleText-weight': bold ? 700 : 400,
        '--lw-simpleText-color': color,
    };

    const mergedStyle = style ? { ...cssVars, ...style } : cssVars;

    return (
        <p
            className={['lw-simpleText', className].filter(Boolean).join(' ')}
            style={mergedStyle /* runtime dynamic: driven by size/bold/color props (and optional caller overrides) */}
            {...props}
        >
            {children}
        </p>
    );
};

export default SimpleText;
