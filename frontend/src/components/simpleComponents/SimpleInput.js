import React, { forwardRef, useState, useEffect, useRef } from 'react';
import SimpleContainer from './SimpleContainer';
import { colors } from '../../constant/colors';
import SimpleIcon from './SimpleIcon';

import './SimpleInput.scss';

const SimpleInput = forwardRef(
    ({
        title,
        titleFontSize = 16,
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

        containerDir,

        inputRef,

        timeToWaitInMilli = 500,
        ...props
    }, ref) => {
        const [isFocused, setIsFocused] = useState(false);
        const [delayedValue, setDelayedValue] = useState(value ?? '');
        const timeoutRef = useRef(null);

        // Cleanup debounce timer on unmount
        useEffect(() => {
            return () => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
            };
        }, []);

        const style = _style;
        const textStyle = _textStyle;
        const iconStyle = _iconStyle;

        function getBorderColor() {
            if (disabled) return colors.disabledHighlighted;
            if (error) return colors.error;
            return isFocused ? colors.primaryHighlighted : colors.secondaryHighlighted;
        }

        function getBackgroundColor() {
            if (disabled) return colors.disabled;
            return colors.white;
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

            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }

            timeoutRef.current = setTimeout(() => {
                onChange?.(e);
                timeoutRef.current = null;
            }, timeToWaitInMilli);
        };

        useEffect(() => {
            setDelayedValue(value ?? '');
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        }, [value]);

        const shouldFloatLabel = isFocused || !!delayedValue || type === 'date';

        const resolvedDir = 'rtl';

        const sizeKey = String(inputSize || 'Medium');
        const sizeClass =
            sizeKey.toLowerCase() === 'small'
                ? 'lw-simpleInput--small'
                : sizeKey.toLowerCase() === 'big'
                    ? 'lw-simpleInput--big'
                    : 'lw-simpleInput--medium';

        const resolvedClassName = [
            'lw-simpleInput',
            sizeClass,
            className,
            isFocused ? 'is-focused' : '',
            shouldFloatLabel ? 'is-floated' : '',
            error ? 'has-error' : '',
            disabled ? 'is-disabled' : '',
            rightIcon ? 'has-rightIcon' : '',
            leftIcon ? 'has-leftIcon' : '',
        ]
            .filter(Boolean)
            .join(' ');

        return (
            <SimpleContainer
                ref={ref}
                className={resolvedClassName}
                dir={resolvedDir}
                style={style}
            >
                {title && (
                    <SimpleContainer
                        className="lw-simpleInput__label"
                        style={{
                            fontSize: `${Number(titleFontSize || 16) / 16}rem`,
                            borderColor: getBorderColor(),
                            backgroundColor: getBackgroundColor(),
                        }}
                    >
                        {error || title}
                    </SimpleContainer>
                )}

                {rightIcon && (
                    <SimpleContainer
                        className="lw-simpleInput__icon lw-simpleInput__icon--right"
                        style={iconStyle}
                    >
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
                    style={{ textAlign: 'right', ...(textStyle || {}) }}
                    value={delayedValue}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    disabled={disabled}
                    ref={inputRef}
                    {...props}
                />

                {leftIcon && (
                    <SimpleContainer
                        className="lw-simpleInput__icon lw-simpleInput__icon--left"
                        style={iconStyle}
                    >
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