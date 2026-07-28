import React, { forwardRef, useState, useEffect, useRef } from 'react';
import SimpleContainer from './SimpleContainer';
import { colors } from '../../constant/colors';
import SimpleIcon from './SimpleIcon';

import './SimpleInput.scss';

/**
 * Format native date/time values as dd/mm/yyyy HH:mm for display/editing.
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

/** Parse user-typed dd/mm/yyyy [HH:mm] back to native input value. */
function parseTemporalText(type, text) {
    const raw = String(text ?? '').trim().replace(/\s+/g, ' ');
    if (!raw) return '';

    if (type === 'time') {
        const m = raw.match(/^(\d{1,2}):(\d{2})$/);
        if (!m) return null;
        const hh = Number(m[1]);
        const mm = Number(m[2]);
        if (hh > 23 || mm > 59) return null;
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }

    if (type === 'date') {
        const m = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
        if (!m) return null;
        const dd = Number(m[1]);
        const mo = Number(m[2]);
        const yyyy = Number(m[3]);
        if (mo < 1 || mo > 12 || dd < 1 || dd > 31) return null;
        return `${yyyy}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }

    if (type === 'datetime-local') {
        const m = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})[ T](\d{1,2}):(\d{2})$/);
        if (!m) return null;
        const dd = Number(m[1]);
        const mo = Number(m[2]);
        const yyyy = Number(m[3]);
        const hh = Number(m[4]);
        const mi = Number(m[5]);
        if (mo < 1 || mo > 12 || dd < 1 || dd > 31 || hh > 23 || mi > 59) return null;
        return `${yyyy}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
    }

    return null;
}

function emitChange(onChange, nativeValue) {
    if (!onChange) return;
    onChange({ target: { value: nativeValue } });
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
        const temporalTypes = ['date', 'datetime-local', 'time', 'month', 'week'];
        const isTemporalInput = temporalTypes.includes(type);
        const showCalendarButton = type === 'date' || type === 'datetime-local' || type === 'month' || type === 'week';
        // month/week keep native control; date/time/datetime become editable text.
        const isEditableTemporal = type === 'date' || type === 'datetime-local' || type === 'time';

        const [isFocused, setIsFocused] = useState(false);
        const [delayedValue, setDelayedValue] = useState(value ?? '');
        const [textValue, setTextValue] = useState(() =>
            isEditableTemporal ? formatTemporalDisplay(type, value ?? '') : ''
        );
        const timeoutRef = useRef(null);
        const textInputRef = useRef(null);
        const pickerRef = useRef(null);

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
            if (isEditableTemporal) {
                const parsed = parseTemporalText(type, textValue);
                if (parsed !== null) {
                    setDelayedValue(parsed);
                    setTextValue(formatTemporalDisplay(type, parsed));
                    if (parsed !== String(value ?? '')) emitChange(onChange, parsed);
                } else {
                    // Restore last valid value if typing was incomplete/invalid.
                    setTextValue(formatTemporalDisplay(type, delayedValue));
                }
            }
            onBlur?.(e);
            setIsFocused(false);
        }

        const commitNativeValue = (nativeValue) => {
            setDelayedValue(nativeValue);
            if (isEditableTemporal) {
                setTextValue(formatTemporalDisplay(type, nativeValue));
            }
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            timeoutRef.current = setTimeout(() => {
                emitChange(onChange, nativeValue);
                timeoutRef.current = null;
            }, isEditableTemporal ? 0 : timeToWaitInMilli);
        };

        const handleNativeInputChange = (e) => {
            const newValue = e.target.value;
            setDelayedValue(newValue);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
                onChange?.(e);
                timeoutRef.current = null;
            }, timeToWaitInMilli);
        };

        const handleTextChange = (e) => {
            const next = e.target.value;
            setTextValue(next);
            const parsed = parseTemporalText(type, next);
            if (parsed === null) return;
            setDelayedValue(parsed);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
                emitChange(onChange, parsed);
                timeoutRef.current = null;
            }, timeToWaitInMilli);
        };

        useEffect(() => {
            const next = value ?? '';
            setDelayedValue(next);
            if (isEditableTemporal && !isFocused) {
                setTextValue(formatTemporalDisplay(type, next));
            }
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        }, [value, type, isEditableTemporal, isFocused]);

        const shouldFloatLabel = isFocused || !!delayedValue || !!textValue || type === 'date' || type === 'datetime-local';

        const resolvedDir = containerDir || 'rtl';
        const inputDir = isTemporalInput ? 'ltr' : resolvedDir;

        const setTextFieldRef = (node) => {
            textInputRef.current = node;
            if (typeof inputRef === 'function') inputRef(node);
            else if (inputRef && typeof inputRef === 'object') inputRef.current = node;
        };

        const openTemporalPicker = (e) => {
            e?.preventDefault?.();
            e?.stopPropagation?.();
            if (disabled) return;
            const el = pickerRef.current || textInputRef.current;
            if (!el) return;
            try {
                if (typeof el.showPicker === 'function') el.showPicker();
                else el.focus();
            } catch {
                el.focus();
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
            isEditableTemporal ? 'is-temporalText' : '',
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

                {isEditableTemporal ? (
                    <>
                        <input
                            type="text"
                            className="lw-simpleInput__field lw-simpleInput__field--temporalText"
                            dir="ltr"
                            inputMode="numeric"
                            autoComplete="off"
                            spellCheck={false}
                            {...props}
                            style={{
                                textAlign: 'right',
                                ...(textStyle || {}),
                                ...(props.style || {}),
                            }}
                            value={textValue}
                            onChange={handleTextChange}
                            onFocus={handleFocus}
                            onBlur={handleBlur}
                            disabled={disabled}
                            ref={setTextFieldRef}
                            placeholder={
                                type === 'time'
                                    ? 'HH:mm'
                                    : type === 'date'
                                        ? 'dd/mm/yyyy'
                                        : 'dd/mm/yyyy HH:mm'
                            }
                        />
                        {/* Hidden native picker — calendar button / optional sync only */}
                        <input
                            type={type}
                            className="lw-simpleInput__nativePicker"
                            tabIndex={-1}
                            aria-hidden="true"
                            disabled={disabled}
                            value={delayedValue}
                            onChange={(e) => commitNativeValue(e.target.value)}
                            ref={pickerRef}
                        />
                    </>
                ) : (
                    <input
                        type={type}
                        className="lw-simpleInput__field"
                        dir={inputDir}
                        {...props}
                        style={{
                            ...(isTemporalInput ? { textAlign: 'right' } : { textAlign: 'right' }),
                            ...(textStyle || {}),
                            ...(props.style || {}),
                        }}
                        value={delayedValue}
                        onChange={handleNativeInputChange}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        disabled={disabled}
                        ref={setTextFieldRef}
                    />
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
