import React from 'react';

const SimpleContainer = (props) => {
  const { children, style, ...rest } = props;

  return (
    <div style={style} {...rest}>
      {children}
    </div>
  );
};

export default SimpleContainer;
