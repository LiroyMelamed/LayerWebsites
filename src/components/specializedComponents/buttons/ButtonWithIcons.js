import React, { forwardRef } from 'react';
import SimpleButton from '../../simpleComponents/SimpleButton';
import SimpleIcon from '../../simpleComponents/SimpleIcon';
import SimpleText from '../../simpleComponents/SimpleText';

const ButtonWithIcons = forwardRef(({ onMouseDown, onMouseUp, onTouchStart, onTouchEnd, leftIcon, rightIcon, iconStyle, tintColor, textStyle, style, children, ...props }, ref) => {
    const IconStyle = {
        width: 24,
        height: 24,
        ...iconStyle,
    };

    const TextStyle = {
        flexDirection: 'row',
        ...textStyle,
    };

    return (
        <SimpleButton
            ref={ref} // Pass the ref to SimpleButton
            style={style}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            {...props}
        >
            {leftIcon && (
                <SimpleIcon tintColor={tintColor} src={leftIcon} style={{ ...IconStyle, marginRight: '8px' }} />
            )}
            <SimpleText style={TextStyle}>
                {children}
            </SimpleText>
            {rightIcon && (
                <SimpleIcon tintColor={tintColor} src={rightIcon} style={{ ...IconStyle, marginLeft: '8px' }} />
            )}
        </SimpleButton>
    );
});

export default ButtonWithIcons;
