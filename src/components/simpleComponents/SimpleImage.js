import React from 'react';

export default function SimpleImage({ src, style, tintColor, resizeMode = 'contain', ...props }) {
  const isTinted = !!tintColor;

  const imageStyle = {
    ...style,
    objectFit: resizeMode,
    display: 'block',
    userSelect: 'none',
    pointerEvents: 'none',
    ...(isTinted && {
      backgroundColor: tintColor || 'black',
      WebkitMaskImage: `url(${src?.uri || src})`,
      maskImage: `url(${src?.uri || src})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    }),
  };

  if (isTinted) {
    return (
      <div
        {...props}
        style={imageStyle}
      />
    );
  }

  return (
    <img
      {...props}
      src={src?.uri || src}
      style={imageStyle}
      alt="SimpleImage"
    />
  );
}