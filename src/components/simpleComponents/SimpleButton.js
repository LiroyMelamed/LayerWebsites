import React from 'react';
import colors from '../../constant/colors';

export const buttonSize = {
  SMALL: "Small",
  MEDIUM: "Medium"
}

export const buttonStyles = {
  Small: {
    height: 24,
    iconSize: 12,
    fontSize: 12,
    padding: '8px 12px',
  },
  Medium: {
    height: 40,
    iconSize: 20,
    fontSize: 20,
    padding: '10px 20px',
  },
};

const SimpleButton = ({ children, onClick, onMouseDown, onMouseUp, onTouchStart, onTouchEnd, style, ...props }) => {
  const buttonStyle = {
    padding: '8px 12px',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    backgroundColor: colors.transparent,
    WebkitTapHighlightColor: 'transparent',
    ...style,
  };

  return (
    <button
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
};

export default SimpleButton;
