import React from 'react';
import colors from '../../constant/colors';

const SimpleButton = (props) => {
  const { children, style, onClick, ...rest } = props;

  const buttonStyle = {
    padding: '10px 20px', 
    borderRadius: '4px', 
    border: 'none', 
    cursor: 'pointer', 
    backgroundColor: colors.transparent, 
    WebkitTapHighlightColor: 'transparent', // Remove tap highlight color
    ...style 
  };

  return (
    <button
      style={buttonStyle}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
};

export default SimpleButton;
