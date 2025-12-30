import React from 'react';

import './Separator.scss';

const Separator = ({ orientation = 'horizontal', className = '', style }) => {
    const orientationClass = orientation === 'vertical' ? 'lw-separator--vertical' : 'lw-separator--horizontal';
    const mergedClassName = ['lw-separator', orientationClass, className].filter(Boolean).join(' ');

    return <div className={mergedClassName} style={style}></div>;
};

export default Separator;
