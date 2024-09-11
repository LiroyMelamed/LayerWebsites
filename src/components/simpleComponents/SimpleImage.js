import React from 'react';

const SimpleImage = ({src, style, props}) => {

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
      {...props}
    />
  );
};

export default SimpleImage;
