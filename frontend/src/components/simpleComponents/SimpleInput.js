import React, { forwardRef, useState, useEffect } from 'react';
import SimpleContainer from './SimpleContainer';
import { colors } from '../../constant/colors';
import SimpleIcon from './SimpleIcon';

import './SimpleInput.scss';

const SimpleInput = forwardRef(
    ({
        title,
        leftIcon,
        rightIcon,
        className,
        tintColor,
        IconStyle: _iconStyle,
        textStyle: _textStyle,
        style: _style,
        value,
        onChange,
        type = 'text',
        inputSize = 'Medium',
        disabled = false,
        onFocus,
        onBlur,
        error,

        inputRef,

        timeToWaitInMilli = 500,
        ...props
    }, ref) => {
        const [isFocused, setIsFocused] = useState(false);
        const [delayedValue, setDelayedValue] = useState(value);
        const [timeoutId, setTimeoutId] = useState(null);

        function getBorderColor() {
            if (disabled) return colors.disabledHighlighted;
            if (error) return colors.error;
            return isFocused ? colors.primaryHighlighted : colors.secondaryHighlighted;
        }

        function handleFocus(e) {
            onFocus?.(e);
            setIsFocused(true);
        }

        function handleBlur(e) {
            onBlur?.(e);
            setIsFocused(false);
        }

        const handleInputChange = (e) => {
            const newValue = e.target.value;
            setDelayedValue(newValue);

            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            const newTimeoutId = setTimeout(() => {
                onChange?.(e);
                setTimeoutId(null);
            }, timeToWaitInMilli);

            setTimeoutId(newTimeoutId);
        };

        useEffect(() => {
            setDelayedValue(value);
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }, [value]);

        const shouldFloatLabel = isFocused || !!delayedValue || type === 'date';

        const resolvedDir = props.dir || 'rtl';

        const resolvedInputSizeClassName = `lw-simpleInput--${String(inputSize).toLowerCase()}`;
        const resolvedClassName = [
            'lw-simpleInput',
            resolvedInputSizeClassName,
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
                dir={resolvedDir}
            >
                {title && (
                    <SimpleContainer className="lw-simpleInput__label">
                        {error || title}
                    </SimpleContainer>
                )}

                {rightIcon && (
                    <SimpleContainer className="lw-simpleInput__icon lw-simpleInput__icon--right">
                        <SimpleIcon
                            tintColor={tintColor || getBorderColor()}
                            src={rightIcon}
                        />
                    </SimpleContainer>
                )}

                <input
                    type={type}
                    className="lw-simpleInput__field"
                    dir={resolvedDir}
                    value={delayedValue}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    disabled={disabled}
                    ref={inputRef}
                    {...props}
                />

                {leftIcon && (
                    <SimpleContainer className="lw-simpleInput__icon lw-simpleInput__icon--left">
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

export default SimpleInput;

export const inputSize = {
    SMALL: "Small",
    MEDIUM: "Medium",
    BIG: "Big"
};

export const inputStyles = {
    Small: {
        height: 24,
        fontSize: 12,
        padding: '8px',
        labelTop: '50%',
        borderStyle: 'solid',
        transformFocused: 'translateY(-85%) scale(0.7)',
    },
    Medium: {
        height: 32,
        fontSize: 16,
        padding: '16px',
        labelTop: '50%',
        borderStyle: 'solid',
        transformFocused: 'translateY(-110%) scale(0.7)',
    },
    Big: {
        height: 40,
        fontSize: 24,
        padding: '16px',
        labelTop: '50%',
        transformFocused: 'translateY(-110%) scale(0.7)',
    },
};