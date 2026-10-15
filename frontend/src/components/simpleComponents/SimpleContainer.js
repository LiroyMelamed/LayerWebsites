import React, { forwardRef } from 'react';

import './SimpleContainer.scss';

const SimpleContainer = forwardRef(({ children, onPress, style, className, ...rest }, ref) => {
  return React.createElement(
    'div',
    {
      ref,
      className: ['lw-simpleContainer', className].filter(Boolean).join(' '),
      style,
      ...rest,
      onClick: onPress,
    },
    children
  );
});

export default SimpleContainer;
