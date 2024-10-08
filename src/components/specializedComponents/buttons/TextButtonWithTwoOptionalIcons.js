import React from 'react';
import SimpleButton from '../../simpleComponents/SimpleButton';
import SimpleContainer from '../../simpleComponents/SimpleContainer';
import SimpleIcon from '../../simpleComponents/SimpleIcon';
import SimpleText from '../../simpleComponents/SimpleText';

export default function TextButtonWithTwoOptionalIcons({
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
}) {
    const buttonStyle = {
        display: 'flex',
        ...style,
    };

    return (
        <SimpleButton
            {...props}
            style={buttonStyle}
        >
            <SimpleContainer style={{ flexDirection: 'row', alignItems: 'center', }}>
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
}
