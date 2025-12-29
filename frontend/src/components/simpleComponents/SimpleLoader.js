import React from 'react';
import SimpleContainer from './SimpleContainer';

import './SimpleLoader.scss';

const SimpleLoader = ({ style, className }) => {
    return (
        <SimpleContainer
            className={['lw-simpleLoader', className].filter(Boolean).join(' ')}
            style={style}
        >
            <SimpleContainer className="lw-simpleLoader__dot lw-simpleLoader__dot--1" />
            <SimpleContainer className="lw-simpleLoader__dot lw-simpleLoader__dot--2" />
            <SimpleContainer className="lw-simpleLoader__dot lw-simpleLoader__dot--3" />
        </SimpleContainer>
    );
};

export default SimpleLoader;
