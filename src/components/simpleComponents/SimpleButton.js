import React from 'react';
import colors from '../../constant/colors';

const SimpleButton = ({ children, onClick, onMouseDown, onMouseUp, onTouchStart, onTouchEnd, style, ...props }) => {
  const buttonStyle = {
    padding: '8px 12px',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    backgroundColor: colors.transparent,
    WebkitTapHighlightColor: 'transparent', // Remove tap highlight color
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
