import React from 'react';
import { useTranslation } from 'react-i18next';

export default function SimpleImage({ src, style, tintColor = null, resizeMode = 'contain', ...props }) {
  const { t } = useTranslation();
  const imageStyle = {
    ...style,
    objectFit: resizeMode,
    display: 'block',
    userSelect: 'none',
    pointerEvents: 'none',
  };

  const imageWithTintStyle = {
    width: style?.width || '100%',
    height: style?.height || '100px',
    backgroundColor: tintColor,
    WebkitMaskImage: `url(${src?.uri || src})`,
    maskImage: `url(${src?.uri || src})`,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
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
      alt={props?.alt ?? t('common.simpleImageAlt')}
    />
  );
}
