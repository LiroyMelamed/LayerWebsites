import React, { forwardRef } from 'react';
import { colors } from '../../constant/colors';

const SimpleButton = forwardRef(({ controlId, style, textStyle, onPress, disabled, onPressIn, onPressOut, children, ...props }, ref) => {

  function handlePress(event) {
    if (!disabled) {
      onPress?.(event);
    }
  }

  const buttonStyle = {
    background: colors.transparent,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    borderRadius: 8,
    padding: '8px 12px',
    fontFamily: 'inherit',
    transition: 'box-shadow 120ms ease, transform 80ms ease',
    ...style,
  };

  return (
    <button
      {...props}
      style={buttonStyle}
      onClick={handlePress}
      onMouseDown={onPressIn}
      onMouseUp={onPressOut}
      disabled={disabled}
      ref={ref}
    >
      {children}
    </button >
  );
});

export default SimpleButton;
