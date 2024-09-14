import React from 'react';
import colors from '../../constant/colors';

const SimpleText = ({ size = 16, bold = false, color = colors.lightText, children, style, ...props }) => {
    return (
        <p
            style={{
                fontSize: `${size}px`,
                fontWeight: bold ? 'bold' : 'normal',
                color, // Use the color prop
                margin: 0,
                fontFamily: 'Rubik, sans-serif',
                direction: 'rtl', // Set text direction to RTL
                textAlign: 'right', // Align text to the right
                ...style
            }}
            {...props}
        >
            {children}
        </p>
    );
};

export default SimpleText;
