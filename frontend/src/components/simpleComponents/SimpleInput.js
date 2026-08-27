import React, { forwardRef, useState, useEffect, useRef } from 'react';
import SimpleContainer from './SimpleContainer';
import BlockDateInput from './BlockDateInput';
import { colors } from '../../constant/colors';
import SimpleIcon from './SimpleIcon';
import {
    applyTemporalDigitMask,
    formatTemporalDisplay,
    parseTemporalText,
    temporalPlaceholder,
    isTemporalMaskComplete,
    editTemporalDigits,
    deleteTemporalDigit,
    snapCaretToDigitSlot,
} from './temporalMask';

import './SimpleInput.scss';

function emitChange(onChange, nativeValue) {
    if (!onChange) return;
    onChange({ target: { value: nativeValue } });
}

/**
 * Controlled input with rock-solid digit-slot masking for date/time.
 * Digits are capped to DD/MM/YYYY [HH:mm] slots — floods like 20308/08/2026 are impossible.
 * Mid-field edits overwrite the focused digit slot and restore the caret (no jump-to-end corruption).
 * Debounced text fields flush pending values synchronously on blur (Tab-safe).
 *
 * type="date" / "datetime-local" delegate to BlockDateInput (segmented DD/MM/YYYY[/HH:mm]).
 */
const SimpleInputCore = forwardRef(
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
        const isEditableTemporal = type === 'date' || type === 'datetime-local' || type === 'time';

        const [isFocused, setIsFocused] = useState(false);
        const [delayedValue, setDelayedValue] = useState(value ?? '');
        const [textValue, setTextValue] = useState(() =>
            isEditableTemporal ? formatTemporalDisplay(type, value ?? '') : ''
        );
        const timeoutRef = useRef(null);
        const pendingEmitRef = useRef(null);
        const textInputRef = useRef(null);
        const pickerRef = useRef(null);
        const focusedRef = useRef(false);
        const delayedValueRef = useRef(value ?? '');
        const textValueRef = useRef(
            isEditableTemporal ? formatTemporalDisplay(type, value ?? '') : ''
        );
        const caretRestoreRef = useRef(null);
        const onChangeRef = useRef(onChange);
        onChangeRef.current = onChange;

        useEffect(() => {
            return () => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
            };
        }, []);

        useEffect(() => {
            if (!isEditableTemporal) return;
            const caret = caretRestoreRef.current;
            if (caret == null) return;
            caretRestoreRef.current = null;
            const el = textInputRef.current;
            if (!el) return;
            requestAnimationFrame(() => {
                try {
                    el.setSelectionRange(caret, caret);
                } catch {
                    /* ignore */
                }
            });
        }, [textValue, isEditableTemporal]);

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

        const flushPendingEmit = () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            if (pendingEmitRef.current == null) return;
            const next = pendingEmitRef.current;
            pendingEmitRef.current = null;
            emitChange(onChangeRef.current, next);
        };

        function handleFocus(e) {
            focusedRef.current = true;
            onFocus?.(e);
            setIsFocused(true);
            if (isEditableTemporal && isTemporalMaskComplete(type, textValueRef.current)) {
                // Select all so the first keystroke replaces cleanly; mid-click still overwrites slots.
                requestAnimationFrame(() => {
                    try {
                        const el = textInputRef.current;
                        if (el && document.activeElement === el) {
                            el.select();
                        }
                    } catch {
                        /* ignore */
                    }
                });
            }
        }

        function applyTemporalResult(result) {
            textValueRef.current = result.display;
            setTextValue(result.display);
            caretRestoreRef.current = result.caret;

            if (!result.display) {
                delayedValueRef.current = '';
                setDelayedValue('');
                pendingEmitRef.current = '';
                flushPendingEmit();
                return;
            }

            if (!isTemporalMaskComplete(type, result.display)) return;

            const parsed = parseTemporalText(type, result.display);
            if (parsed === null) return;

            delayedValueRef.current = parsed;
            setDelayedValue(parsed);
            pendingEmitRef.current = parsed;
            flushPendingEmit();
        }

        function commitTemporalDraft(draft) {
            const masked = applyTemporalDigitMask(type, draft);
            textValueRef.current = masked;
            setTextValue(masked);

            if (!masked) {
                delayedValueRef.current = '';
                setDelayedValue('');
                pendingEmitRef.current = '';
                flushPendingEmit();
                return true;
            }

            if (!isTemporalMaskComplete(type, masked)) {
                return false;
            }

            const parsed = parseTemporalText(type, masked);
            if (parsed === null) {
                const restored = formatTemporalDisplay(type, value ?? delayedValueRef.current);
                textValueRef.current = restored;
                setTextValue(restored);
                return false;
            }

            delayedValueRef.current = parsed;
            setDelayedValue(parsed);
            textValueRef.current = formatTemporalDisplay(type, parsed);
            setTextValue(textValueRef.current);
            pendingEmitRef.current = parsed;
            flushPendingEmit();
            return true;
        }

        function handleBlur(e) {
            if (!isEditableTemporal) {
                const live = textInputRef.current?.value;
                if (live != null && live !== delayedValueRef.current) {
                    delayedValueRef.current = live;
                    setDelayedValue(live);
                    pendingEmitRef.current = live;
                }
                flushPendingEmit();
            } else {
                const draft = textValueRef.current;
                const ok = commitTemporalDraft(draft);
                if (!ok && String(draft || '').trim() !== '' && !isTemporalMaskComplete(type, draft)) {
                    if (timeoutRef.current) {
                        clearTimeout(timeoutRef.current);
                        timeoutRef.current = null;
                    }
                    pendingEmitRef.current = null;
                    const restored = formatTemporalDisplay(type, value ?? delayedValueRef.current);
                    textValueRef.current = restored;
                    setTextValue(restored);
                }
            }

            focusedRef.current = false;
            onBlur?.(e);
            setIsFocused(false);
        }

        const commitNativeValue = (nativeValue) => {
            delayedValueRef.current = nativeValue;
            setDelayedValue(nativeValue);
            if (isEditableTemporal) {
                const formatted = formatTemporalDisplay(type, nativeValue);
                textValueRef.current = formatted;
                setTextValue(formatted);
            }
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            pendingEmitRef.current = nativeValue;
            if (isEditableTemporal || timeToWaitInMilli <= 0) {
                flushPendingEmit();
                return;
            }
            timeoutRef.current = setTimeout(() => {
                flushPendingEmit();
            }, timeToWaitInMilli);
        };

        const handleNativeInputChange = (e) => {
            const newValue = e.target.value;
            delayedValueRef.current = newValue;
            setDelayedValue(newValue);
            pendingEmitRef.current = newValue;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (timeToWaitInMilli <= 0) {
                flushPendingEmit();
                return;
            }
            timeoutRef.current = setTimeout(() => {
                flushPendingEmit();
            }, timeToWaitInMilli);
        };

        const handleTemporalKeyDown = (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            if (e.key === 'Backspace' || e.key === 'Delete') {
                e.preventDefault();
                const start = e.target.selectionStart ?? 0;
                const end = e.target.selectionEnd ?? start;
                const result = deleteTemporalDigit(
                    type,
                    textValueRef.current,
                    start,
                    end,
                    e.key === 'Delete' ? 'delete' : 'backspace'
                );
                applyTemporalResult(result);
                return;
            }

            // Digits are handled in beforeinput to avoid double-apply with IME/mobile.
            if (/^\d$/.test(e.key) && typeof InputEvent !== 'undefined') {
                return;
            }

            if (/^\d$/.test(e.key)) {
                e.preventDefault();
                const start = e.target.selectionStart ?? 0;
                const end = e.target.selectionEnd ?? start;
                const result = editTemporalDigits(type, textValueRef.current, e.key, start, end);
                applyTemporalResult(result);
            }
        };

        const handleTemporalBeforeInput = (e) => {
            const data = e.data;
            if (data == null) return;
            if (!/^\d+$/.test(data)) {
                if (e.inputType && String(e.inputType).startsWith('insert')) {
                    e.preventDefault();
                }
                return;
            }
            e.preventDefault();
            const start = e.target.selectionStart ?? 0;
            const end = e.target.selectionEnd ?? start;
            const result = editTemporalDigits(type, textValueRef.current, data, start, end);
            applyTemporalResult(result);
        };

        const handleTemporalPaste = (e) => {
            e.preventDefault();
            const pasted = e.clipboardData?.getData('text') || '';
            const digits = pasted.replace(/\D/g, '');
            if (!digits) return;
            const start = e.target.selectionStart ?? 0;
            const end = e.target.selectionEnd ?? start;
            const result = editTemporalDigits(type, textValueRef.current, digits, start, end);
            applyTemporalResult(result);
        };

        const handleTemporalClick = (e) => {
            const display = textValueRef.current || '';
            if (!display) return;
            const rawCaret = e.target.selectionStart ?? 0;
            const snapped = snapCaretToDigitSlot(type, display, rawCaret);
            if (snapped !== rawCaret) {
                try {
                    e.target.setSelectionRange(snapped, snapped);
                } catch {
                    /* ignore */
                }
            }
        };

        const handleTextChange = (e) => {
            // Fallback path (autofill / rare browsers) — still digit-capped.
            const masked = applyTemporalDigitMask(type, e.target.value);
            textValueRef.current = masked;
            setTextValue(masked);
            caretRestoreRef.current = masked.length;

            if (isTemporalMaskComplete(type, masked)) {
                const parsed = parseTemporalText(type, masked);
                if (parsed !== null) {
                    delayedValueRef.current = parsed;
                    setDelayedValue(parsed);
                    pendingEmitRef.current = parsed;
                    flushPendingEmit();
                }
            }
        };

        useEffect(() => {
            const next = value ?? '';
            // While focused, ignore parent lag behind typing — but always accept
            // external clears (e.g. SearchInput clearOnSelect) so the field resets.
            if (focusedRef.current) {
                if (next !== '' && next !== delayedValueRef.current) return;
                if (next === delayedValueRef.current) return;
            }
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            pendingEmitRef.current = null;
            delayedValueRef.current = next;
            setDelayedValue(next);
            if (isEditableTemporal) {
                const formatted = formatTemporalDisplay(type, next);
                textValueRef.current = formatted;
                setTextValue(formatted);
            }
        }, [value, type, isEditableTemporal]);

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

        const {
            value: _ignoredValue,
            onChange: _ignoredOnChange,
            onFocus: _ignoredOnFocus,
            onBlur: _ignoredOnBlur,
            defaultValue: _ignoredDefault,
            ...safeProps
        } = props;

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
                        onMouseDown={(e) => {
                            e.preventDefault();
                            if (!disabled) textInputRef.current?.focus();
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
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            maxLength={type === 'datetime-local' ? 16 : type === 'date' ? 10 : 5}
                            {...safeProps}
                            style={{
                                textAlign: 'right',
                                ...(textStyle || {}),
                                ...(safeProps.style || {}),
                            }}
                            value={textValue}
                            onChange={handleTextChange}
                            onKeyDown={handleTemporalKeyDown}
                            onBeforeInput={handleTemporalBeforeInput}
                            onPaste={handleTemporalPaste}
                            onClick={handleTemporalClick}
                            onFocus={handleFocus}
                            onBlur={handleBlur}
                            disabled={disabled}
                            ref={setTextFieldRef}
                            placeholder={temporalPlaceholder(type)}
                        />
                        <input
                            type={type}
                            className="lw-simpleInput__nativePicker"
                            tabIndex={-1}
                            aria-hidden="true"
                            disabled={disabled}
                            value={delayedValue || ''}
                            onChange={(e) => commitNativeValue(e.target.value)}
                            ref={pickerRef}
                        />
                    </>
                ) : (
                    <input
                        type={type}
                        className="lw-simpleInput__field"
                        dir={inputDir}
                        {...safeProps}
                        style={{
                            textAlign: 'right',
                            ...(textStyle || {}),
                            ...(safeProps.style || {}),
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

const SimpleInput = forwardRef((props, ref) => {
    const {
        type = 'text',
        title,
        value,
        onChange,
        disabled = false,
        error,
        className,
        timeToWaitInMilli = 500,
        containerDir,
    } = props;

    if (type === 'date' || type === 'datetime-local') {
        return (
            <BlockDateInput
                ref={ref}
                title={title}
                mode={type}
                value={value}
                onChange={onChange}
                disabled={disabled}
                error={error}
                className={className}
                timeToWaitInMilli={timeToWaitInMilli}
                containerDir={containerDir}
            />
        );
    }

    return <SimpleInputCore ref={ref} {...props} />;
});

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
