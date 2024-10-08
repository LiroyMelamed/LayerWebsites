import React from 'react';
import SimpleButton from '../../simpleComponents/SimpleButton';
import SimpleImage from '../../simpleComponents/SimpleImage';

const ImageButton = ({ src, alt, width, height, onClick, style, ...rest }) => {

  const buttonStyle = {
    padding: 0,
    border: 'none',
    background: 'none',
    width: width,
    height: height,
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

export default ImageButton;
