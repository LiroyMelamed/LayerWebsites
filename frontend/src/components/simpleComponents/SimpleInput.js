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

        containerDir,

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

        const inputDir = props.dir || 'rtl';
        const resolvedContainerDir = containerDir || (type === 'date' ? 'rtl' : inputDir);

        const baseLabelInlineStartRem = rightIcon ? 40 / 16 : 8 / 16;
        const focusShiftRem = 4 / 16;
        const focusedLabelInlineStartRem = resolvedContainerDir === 'rtl'
            ? Math.max(0, baseLabelInlineStartRem - focusShiftRem)
            : baseLabelInlineStartRem + focusShiftRem;

        const sizePaddingPx = Number.parseInt(String(sizeStyles.padding).replace('px', ''), 10);
        const paddingBlock = leftIcon ? 0.5 : sizePaddingPx / 16;
        const paddingInlineStart = rightIcon ? 30 / 16 : sizePaddingPx / 16;
        const paddingInlineEnd = leftIcon ? 10 / 16 : sizePaddingPx / 16;

        const containerCssVars = {
            '--lw-simpleInput-borderColor': getBorderColor(),
            '--lw-simpleInput-bgColor': getBackgroundColor(),
            '--lw-simpleInput-shadow': 'none',
            '--lw-simpleInput-height': `${sizeStyles.height / 16}rem`,

            '--lw-simpleInput-direction': resolvedContainerDir,

            '--lw-simpleInput-labelRight': `${isFocused ? focusedLabelInlineStartRem : baseLabelInlineStartRem}rem`,
            '--lw-simpleInput-labelTop': String(sizeStyles.labelTop),
            '--lw-simpleInput-labelTransform': shouldFloatLabel ? String(sizeStyles.transformFocused) : 'translateY(-50%)',
            '--lw-simpleInput-labelOpacity': shouldFloatLabel ? 1 : 0.6,
            '--lw-simpleInput-labelColor': error ? colors.error : colors.primaryHighlighted,
            '--lw-simpleInput-labelFontSize': `${titleFontSize / 16}rem`,

            '--lw-simpleInput-fontSize': `${sizeStyles.fontSize / 16}rem`,
            '--lw-simpleInput-paddingBlock': `${paddingBlock}rem`,
            '--lw-simpleInput-paddingInlineStart': `${paddingInlineStart}rem`,
            '--lw-simpleInput-paddingInlineEnd': `${paddingInlineEnd}rem`,
        };

        const mergedContainerStyle = style ? { ...containerCssVars, ...style } : containerCssVars;

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
                    dir={inputDir}
                    style={textStyle}
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