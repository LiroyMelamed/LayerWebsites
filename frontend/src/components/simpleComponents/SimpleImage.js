import React from 'react';

export default function SimpleImage({ src, style, tintColor = null, resizeMode = 'contain', ...props }) {
  const imageStyle = {
    ...style,
    objectFit: resizeMode,
    display: 'block',  // Ensure the image is a block element to avoid extra space from inline elements
    userSelect: 'none', // Prevent image selection
    pointerEvents: 'none', // Ensure the image does not interfere with pointer events
  };

  const imageWithTintStyle = {
    width: style?.width || '100%',  // Use natural width if no width is provided
    height: style?.height || '100px', // Use natural height if no height is provided
    backgroundColor: tintColor,
    WebkitMaskImage: `url(${src?.uri || src})`,
    maskImage: `url(${src?.uri || src})`,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    ...style,
  };

  if (tintColor) {
    return (
      <div
        {...props}
        style={imageWithTintStyle}
      />
    );
  }

  return (
    <img
      {...props}
      src={src?.uri || src}
      style={imageStyle}
      alt="SimpleImage"  // Ensure to add a meaningful alt text
    />
  );
}