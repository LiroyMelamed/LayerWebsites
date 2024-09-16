import React, { forwardRef } from 'react';
import colors from '../../constant/colors';

export const buttonSize = {
  SMALL: "Small",
  MEDIUM: "Medium",
  BIG: "Big"
};

export const buttonStyles = {
  Small: {
    height: 24,
    iconSize: 12,
    fontSize: 12,
    padding: '8px 12px',
  },
  Medium: {
    height: 40,
    iconSize: 16,
    fontSize: 16,
    padding: '10px 20px',
  },
  Big: {
    height: 60,
    iconSize: 24,
    fontSize: 24,
    padding: '12px 28px',
  }
};

const SimpleButton = forwardRef(({ children, onClick, onMouseDown, onMouseUp, onTouchStart, onTouchEnd, style, size = 'Medium', backgroundColor = colors.transparent, ...props }, ref) => {
  const currentSizeStyle = buttonStyles[size];

  const buttonStyle = {
    padding: currentSizeStyle.padding,
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    backgroundColor: backgroundColor,
    WebkitTapHighlightColor: 'transparent',
    fontSize: currentSizeStyle.fontSize,
    height: currentSizeStyle.height,
    ...style,
  };

  return (
    <button
      ref={ref}
      style={buttonStyle}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      {...props}
    >
      {children}
    </button>
  );
});

export default SimpleButton;
