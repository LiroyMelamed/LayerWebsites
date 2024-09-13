import React from 'react';
import SimpleImage from './SimpleImage';
import SimpleButton from './SimpleButton';

const IconButton = ({ src, alt, size, onClick, style, ...rest }) => {

const buttonStyle = {
    padding: 0,
    border: 'none',
    background: 'none',
    width: size,
    height: size,
    ...style
  };

  const imageStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  };

  return (
    <SimpleButton
      onClick={onClick}
      style={buttonStyle}
      {...rest}
    >
      <SimpleImage
        src={src}
        alt={alt}
        style={imageStyle}
      />
    </SimpleButton>
  );
};

export default IconButton;
