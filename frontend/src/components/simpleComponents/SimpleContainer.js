import React, { forwardRef } from 'react';

const SimpleContainer = forwardRef(({ children, style, ...rest }, ref) => {
  return (
    <div
      ref={ref}
      style={{
        ...style,
        display: 'flex',
        boxSizing: 'border-box'
      }}
      {...rest}
    >
      {children}
    </div>
  );
});

export default SimpleContainer;
