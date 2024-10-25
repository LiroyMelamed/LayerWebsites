import React, { forwardRef } from 'react';
import SimpleButton from '../../simpleComponents/SimpleButton';
import SimpleContainer from '../../simpleComponents/SimpleContainer';
import SimpleIcon from '../../simpleComponents/SimpleIcon';
import SimpleText from '../../simpleComponents/SimpleText';

const TextButtonWithTwoOptionalIcons = forwardRef(({
    children,
    style,
    textStyle,
    leftIcon,
    leftIconSize,
    leftIconTintColor,
    rightIcon,
    rightIconSize,
    rightIconTintColor,
    ...props
}, ref) => {
    const buttonStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
    };

    return (
        <SimpleButton
            {...props}
            ref={ref} // Forward the ref to SimpleButton
            style={buttonStyle}
        >
            <SimpleContainer style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center' }}>
                {rightIcon && (
                    <SimpleIcon
                        src={rightIcon}
                        size={rightIconSize}
                        tintColor={rightIconTintColor}
                        style={{ marginLeft: 8 }}
                    />
                )}

                <SimpleText style={textStyle}>
                    {children}
                </SimpleText>

                {leftIcon && (
                    <SimpleIcon
                        src={leftIcon}
                        size={leftIconSize}
                        tintColor={leftIconTintColor}
                        style={{ marginRight: 8 }}
                    />
                )}
            </SimpleContainer>
        </SimpleButton>
    );
});

export default TextButtonWithTwoOptionalIcons;
