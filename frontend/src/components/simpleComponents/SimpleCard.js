import React from 'react';
import SimpleContainer from './SimpleContainer';

import './SimpleCard.scss';

const SimpleCard = ({ style: _style, className = '', children, ...props }) => {

    const mergedClassName = ['lw-simpleCard', className].filter(Boolean).join(' ');

    return (
        <SimpleContainer
            className={mergedClassName}
            {...props}
        >
            {children}
        </SimpleContainer>
    );
};

export default SimpleCard;
