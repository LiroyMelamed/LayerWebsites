import React from 'react';
import SimpleContainer from './SimpleContainer';

import './SimpleCard.scss';

const SimpleCard = ({ style, className = '', children, ...props }) => {

    const mergedClassName = ['lw-simpleCard', className].filter(Boolean).join(' ');

    // `style` is a runtime override passed by callers.

    return (
        <SimpleContainer
            style={style}
            className={mergedClassName}
            {...props}
        >
            {children}
        </SimpleContainer>
    );
};

export default SimpleCard;
