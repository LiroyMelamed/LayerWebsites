import React, { forwardRef } from 'react';

const SimpleContainer = forwardRef(({ children, onPress, style, ...rest }, ref) => {
  return (
    <div
      ref={ref}
      style={{
        ...style,
        display: 'flex',
        boxSizing: 'border-box'
      }}
      {...rest}
      onClick={onPress}
    >
      {children}
    </div>
  );
});

export default SimpleContainer;
