import React, { forwardRef, useState } from 'react';
import SimpleContainer from './SimpleContainer';
import SimpleIcon from './SimpleIcon';
import { colors } from '../../constant/colors';

import './SimpleTextArea.scss';

const SimpleTextArea = forwardRef(
    ({
        title,
        leftIcon,
        rightIcon,
        tintColor,
        IconStyle: _iconStyle,
        textStyle: _textStyle,
        style: _style,
        className,
        value,
        onChange,
        disabled = false,
        error = '',
        ...props
    }, ref) => {
        const [isFocused, setIsFocused] = useState(false);

        // Dynamic styles for text area
        function getBorderColor() {
            if (disabled) return colors.disabledHighlighted;
            if (error) return colors.error;
            return isFocused ? colors.primaryHighlighted : colors.secondaryHighlighted;
        }

        const shouldFloatLabel = isFocused || !!value;

        const resolvedClassName = [
            'lw-simpleTextArea',
            className,
            disabled ? 'is-disabled' : '',
            error ? 'has-error' : '',
            isFocused ? 'is-focused' : '',
            shouldFloatLabel ? 'is-floated' : '',
            rightIcon ? 'has-rightIcon' : '',
            leftIcon ? 'has-leftIcon' : '',
        ].filter(Boolean).join(' ');

        return (
            <SimpleContainer
                ref={ref}
                className={resolvedClassName}
            >
                {/* Floating Label */}
                {title && (
                    <SimpleContainer className="lw-simpleTextArea__label">
                        {title}
                    </SimpleContainer>
                )}

                {rightIcon && (
                    <SimpleContainer className="lw-simpleTextArea__icon lw-simpleTextArea__icon--right">
                        <SimpleIcon
                            tintColor={tintColor || getBorderColor()}
                            src={rightIcon}
                        />
                    </SimpleContainer>
                )}

                <textarea
                    className="lw-simpleTextArea__field"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    disabled={disabled}
                    {...props}
                />

                {leftIcon && (
                    <SimpleContainer className="lw-simpleTextArea__icon lw-simpleTextArea__icon--left">
                        <SimpleIcon
                            tintColor={tintColor || getBorderColor()}
                            src={leftIcon}
                        />
                    </SimpleContainer>
                )}
            </SimpleContainer>
        );
    }
);

export default SimpleTextArea;
