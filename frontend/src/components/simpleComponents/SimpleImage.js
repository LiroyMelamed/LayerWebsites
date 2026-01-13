import React from 'react';
import { useTranslation } from 'react-i18next';

export default function SimpleImage({ src, style, tintColor = null, resizeMode = 'contain', ...props }) {
  const { t } = useTranslation();
  const resolvedSrc = src?.uri || src;

  if (!resolvedSrc) {
    return null;
  }
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
    WebkitMaskImage: `url(${resolvedSrc})`,
    maskImage: `url(${resolvedSrc})`,
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
      src={resolvedSrc}
      style={imageStyle}
      alt={props?.alt ?? t('common.simpleImageAlt')}
    />
  );
}
