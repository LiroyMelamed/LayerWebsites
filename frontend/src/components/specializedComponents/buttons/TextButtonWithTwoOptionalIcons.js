import React, { forwardRef } from 'react';
import SimpleButton from '../../simpleComponents/SimpleButton';
import SimpleContainer from '../../simpleComponents/SimpleContainer';
import SimpleIcon from '../../simpleComponents/SimpleIcon';
import SimpleText from '../../simpleComponents/SimpleText';

import './TextButtonWithTwoOptionalIcons.scss';

const TextButtonWithTwoOptionalIcons = forwardRef(({
    children,
    style: _style,
    textStyle: _textStyle,
    className,
    textColor,
    textSize,
    textBold,
    leftIcon,
    leftIconSize,
    leftIconTintColor,
    rightIcon,
    rightIconSize,
    rightIconTintColor,
    ...props
}, ref) => {
    const resolvedClassName = ['lw-textButtonWithTwoOptionalIcons', className].filter(Boolean).join(' ');

    const isPrimitiveText = typeof children === 'string' || typeof children === 'number';

    return (
        <SimpleButton
            {...props}
            ref={ref} // Forward the ref to SimpleButton
            className={resolvedClassName}
        >
            <SimpleContainer className="lw-textButtonWithTwoOptionalIcons__inner">
                {rightIcon && (
                    <SimpleIcon
                        src={rightIcon}
                        size={rightIconSize}
                        tintColor={rightIconTintColor}
                    />
                )}

                {isPrimitiveText ? (
                    <SimpleText color={textColor} size={textSize} bold={textBold}>
                        {children}
                    </SimpleText>
                ) : (
                    <SimpleContainer className="lw-textButtonWithTwoOptionalIcons__content">
                        {children}
                    </SimpleContainer>
                )}

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
