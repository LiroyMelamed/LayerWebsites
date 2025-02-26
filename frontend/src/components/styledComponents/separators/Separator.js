import React from 'react';

const Separator = ({ orientation = 'horizontal', style = {} }) => {
    const separatorStyle = {
        backgroundColor: '#e0e0e0',
        ...(orientation === 'horizontal' ? styles.horizontal : styles.vertical),
        ...style,
    };

    return <div style={separatorStyle}></div>;
};

const styles = {
    horizontal: {
        height: '1px',
        width: '100%',
        margin: '10px 0',
    },
    vertical: {
        width: '1px',
        height: '100%',
        margin: '0 10px',
    },
};

export default Separator;
