import React from 'react';

const SimpleImage = (props) => {
  const { src, style, ...rest } = props;

  const imageStyle = {
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
    ...style
  };

  return (
    <img
      src={src}
      style={imageStyle}
      {...rest}
    />
  );
};

export default SimpleImage;
