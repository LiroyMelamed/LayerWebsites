import React from 'react';

import './Separator.scss';

const Separator = ({ orientation = 'horizontal', className = '', style }) => {
    const orientationClass = orientation === 'vertical' ? 'lw-separator--vertical' : 'lw-separator--horizontal';
    const mergedClassName = ['lw-separator', orientationClass, className].filter(Boolean).join(' ');

    return React.createElement('div', { className: mergedClassName, style });
};

export default Separator;
