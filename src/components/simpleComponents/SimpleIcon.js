import React from 'react';
import SimpleImage from './SimpleImage';

const SimpleIcon = ({ src, alt, size = 24, style, ...rest }) => {
  // Define the style for the icon with default size and any custom styles
  const iconStyle = {
    width: size,
    height: size,
    ...style
  };

  return (
    <SimpleImage
      src={src}
      alt={alt}
      style={iconStyle}
      {...rest}
    />
  );
};

export default SimpleIcon;
