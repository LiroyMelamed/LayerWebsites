import React, { forwardRef, useState, useEffect, useRef } from 'react';
import SimpleContainer from './SimpleContainer';
import { colors } from '../../constant/colors';
import SimpleIcon from './SimpleIcon';

import './SimpleInput.scss';

/**
 * Deterministic display for native date/time inputs.
 * Browsers render these values in the OS language/format (e.g. "06/12/2026, 10:30 AM"
 * on an English phone). The site language must win, so we always mask the native
 * text and show a fixed dd/mm/yyyy HH:mm rendering.
 * Pure string parsing — no Date object — to avoid timezone shifts.
 */
function formatTemporalDisplay(type, rawValue) {
    const v = String(rawValue ?? '');
    if (!v) return '';
    if (type === 'date') {
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
    }
    if (type === 'datetime-local') {
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
        return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : v;
    }
    if (type === 'time') {
        const m = v.match(/^(\d{2}):(\d{2})/);
        return m ? `${m[1]}:${m[2]}` : v;
    }
    return '';
}

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
        const internalInputRef = useRef(null);

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

        const shouldFloatLabel = isFocused || !!delayedValue || type === 'date' || type === 'datetime-local';
        const temporalTypes = ['date', 'datetime-local', 'time', 'month', 'week'];
        const isTemporalInput = temporalTypes.includes(type);
        const showCalendarButton = type === 'date' || type === 'datetime-local' || type === 'month' || type === 'week';

        // Always show our dd/mm/yyyy overlay. Native segment editing hides the
        // active digit (white-on-blue), so temporal fields are picker-only.
        const isTemporalMasked = isTemporalInput;
        const temporalDisplay = isTemporalInput ? formatTemporalDisplay(type, delayedValue) : '';

        const resolvedDir = containerDir || 'rtl';
        const inputDir = isTemporalInput ? 'ltr' : resolvedDir;

        const setFieldRef = (node) => {
            internalInputRef.current = node;
            if (typeof inputRef === 'function') inputRef(node);
            else if (inputRef && typeof inputRef === 'object') inputRef.current = node;
        };

        const openTemporalPicker = (e) => {
            e?.preventDefault?.();
            e?.stopPropagation?.();
            if (disabled) return;
            const el = internalInputRef.current;
            if (!el) return;
            el.focus();
            try {
                if (typeof el.showPicker === 'function') el.showPicker();
            } catch {
                // Older browsers: focus alone is enough for the native UI.
            }
        };

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
            isTemporalInput ? 'is-temporal' : '',
            isTemporalMasked ? 'is-temporalMasked' : '',
            showCalendarButton ? 'has-calendarBtn' : '',
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

                {showCalendarButton && (
                    <button
                        type="button"
                        className="lw-simpleInput__calendarBtn"
                        aria-label="Open calendar"
                        tabIndex={-1}
                        disabled={disabled}
                        onMouseDown={openTemporalPicker}
                        onClick={openTemporalPicker}
                    >
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                            <rect x="3" y="4" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                            <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2" />
                        </svg>
                    </button>
                )}

                <input
                    type={type}
                    className="lw-simpleInput__field"
                    dir={inputDir}
                    {...props}
                    style={{
                        ...(isTemporalInput ? {} : { textAlign: 'right' }),
                        ...(textStyle || {}),
                        ...(props.style || {}),
                    }}
                    value={delayedValue}
                    onChange={handleInputChange}
                    onFocus={(e) => {
                        handleFocus(e);
                        if (isTemporalInput) openTemporalPicker(e);
                    }}
                    onClick={isTemporalInput ? openTemporalPicker : props.onClick}
                    onBlur={handleBlur}
                    disabled={disabled}
                    readOnly={isTemporalInput || Boolean(props.readOnly)}
                    ref={setFieldRef}
                />

                {isTemporalInput && (
                    <span
                        className={"lw-simpleInput__temporalDisplay" + (!temporalDisplay ? " is-empty" : "")}
                        aria-hidden="true"
                    >
                        {temporalDisplay || "\u00A0"}
                    </span>
                )}

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
        padding: '0.5rem',
        labelTop: '50%',
        borderStyle: 'solid',
        transformFocused: 'translateY(-85%) scale(0.7)',
    },
    Medium: {
        height: 32,
        fontSize: 16,
        padding: '1rem',
        labelTop: '50%',
        borderStyle: 'solid',
        transformFocused: 'translateY(-110%) scale(0.7)',
    },
    Big: {
        height: 40,
        fontSize: 24,
        padding: '1rem',
        labelTop: '50%',
        transformFocused: 'translateY(-110%) scale(0.7)',
    },
};
