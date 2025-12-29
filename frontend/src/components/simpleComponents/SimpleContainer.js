import React, { forwardRef } from 'react';

import './SimpleContainer.scss';

const SimpleContainer = forwardRef(({ children, onPress, style, className, ...rest }, ref) => {
  return (
    <div
      ref={ref}
      className={['lw-simpleContainer', className].filter(Boolean).join(' ')}
      style={style}
      {...rest}
      onClick={onPress}
    >
      {children}
    </div>
  );
});

export default SimpleContainer;
