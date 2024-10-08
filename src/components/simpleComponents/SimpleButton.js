import React, { forwardRef } from 'react';
import { colors } from '../../constant/colors';
import SimpleContainer from './SimpleContainer';

// Forward ref to allow parent component to access the button's DOM node
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
      ref={ref} // Attach ref here
    >
      {children}
    </button >
  );
});

export default SimpleButton;
