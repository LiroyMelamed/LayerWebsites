import React, { forwardRef } from 'react';
import './SimpleButton.scss';

const SimpleButton = forwardRef(({ controlId, className, style, textStyle, onPress, disabled, onPressIn, onPressOut, children, ...props }, ref) => {

  function handlePress(event) {
    if (!disabled) {
      onPress?.(event);
    }
  }

  const buttonStyle = {
    ...style,
  };

  const resolvedClassName = ['lw-simpleButton', className].filter(Boolean).join(' ');

  return (
    <button
      {...props}
      className={resolvedClassName}
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
