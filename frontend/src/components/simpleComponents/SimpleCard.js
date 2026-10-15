import React, { forwardRef } from 'react';
import SimpleContainer from './SimpleContainer';

import './SimpleCard.scss';

const SimpleCard = forwardRef(({ style: _style, className = '', children, ...props }, ref) => {

    const mergedClassName = ['lw-simpleCard', className].filter(Boolean).join(' ');

    return (
        <SimpleContainer
            ref={ref}
            className={mergedClassName}
            {...props}
        >
            {children}
        </SimpleContainer>
    );
});

export default SimpleCard;
