import React, { useState } from 'react';
import SimpleButton from '../../simpleComponents/SimpleButton';
import SimpleIcon from '../../simpleComponents/SimpleIcon';

const ButtonWithIcons = ({ onMouseDown, onMouseUp, onTouchStart, onTouchEnd, leftIcon, rightIcon, iconStyle, style, children, props }) => {

    const IconStyle = {
        width: 24,
        height: 24,
        ...iconStyle
    }

    return (
        <SimpleButton
            style={style}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            {...props}
        >
            {leftIcon && (
                <SimpleIcon src={leftIcon} style={{ ...IconStyle, marginRight: '8px' }} />
            )}
            {children}
            {rightIcon && (
                <SimpleIcon src={rightIcon} style={{ ...IconStyle, marginLeft: '8px' }} />
            )}
        </SimpleButton>
    );
};

export default ButtonWithIcons;
