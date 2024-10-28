import React from 'react';

const Separator = ({ orientation = 'horizontal', style = {} }) => {
    const separatorStyle = {
        backgroundColor: '#e0e0e0', // Default color, adjust as needed
        ...(orientation === 'horizontal' ? styles.horizontal : styles.vertical),
        ...style,
    };

    return <div style={separatorStyle}></div>;
};

const styles = {
    horizontal: {
        height: '1px', // Thin line for horizontal separator
        width: '100%', // Full width for horizontal separator
        margin: '10px 0', // Space above and below
    },
    vertical: {
        width: '1px', // Thin line for vertical separator
        height: '100%', // Full height for vertical separator
        margin: '0 10px', // Space on the left and right
    },
};

export default Separator;
