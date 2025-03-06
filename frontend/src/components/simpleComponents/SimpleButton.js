import React, { forwardRef } from 'react';
import { colors } from '../../constant/colors';

const SimpleButton = forwardRef(({ controlId, style, textStyle, onPress, disabled, onPressIn, onPressOut, children, ...props }, ref) => {

  function handlePress(event) {
    console.log('handlePress');

    if (!disabled) {
      onPress?.(event);
    }
  }

  const buttonStyle = {
    background: colors.transparent,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
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
