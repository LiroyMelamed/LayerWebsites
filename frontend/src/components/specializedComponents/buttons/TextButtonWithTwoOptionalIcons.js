import React, { forwardRef } from 'react';
import SimpleButton from '../../simpleComponents/SimpleButton';
import SimpleContainer from '../../simpleComponents/SimpleContainer';
import SimpleIcon from '../../simpleComponents/SimpleIcon';
import SimpleText from '../../simpleComponents/SimpleText';

import './TextButtonWithTwoOptionalIcons.scss';

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
    return (
        <SimpleButton
            {...props}
            ref={ref} // Forward the ref to SimpleButton
            className="lw-textButtonWithTwoOptionalIcons"
            style={style}
        >
            <SimpleContainer className="lw-textButtonWithTwoOptionalIcons__inner">
                {rightIcon && (
                    <SimpleIcon
                        src={rightIcon}
                        size={rightIconSize}
                        tintColor={rightIconTintColor}
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
                    />
                )}
            </SimpleContainer>
        </SimpleButton>
    );
});

export default TextButtonWithTwoOptionalIcons;
