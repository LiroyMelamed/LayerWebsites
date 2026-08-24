import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SimpleContainer from './SimpleContainer';
import { colors } from '../../constant/colors';
import {
    EMPTY_SEGMENTS,
    maxLengthForSegment,
    nativeToSegments,
    parsePastedSegments,
    sanitizeSegmentInput,
    segmentKeysForMode,
    segmentsToNative,
} from './blockDateUtils';

import './BlockDateInput.scss';

const SEGMENT_ARIA = {
    dd: 'dateSegmentDay',
    mm: 'dateSegmentMonth',
    yyyy: 'dateSegmentYear',
    hh: 'dateSegmentHour',
    mi: 'dateSegmentMinute',
};

function emitChange(onChange, nativeValue) {
    if (!onChange) return;
    onChange({ target: { value: nativeValue } });
}

const BlockDateInput = forwardRef(function BlockDateInput(
    {
        title,
        mode = 'date',
        value = '',
        onChange,
        disabled = false,
        error = null,
        className = '',
        timeToWaitInMilli = 0,
        containerDir,
    },
    ref
) {
    const { t } = useTranslation();
    const keys = segmentKeysForMode(mode);
    const inputRefs = useRef({});
    const pickerRef = useRef(null);
    const focusedRef = useRef(false);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const [isFocused, setIsFocused] = useState(false);
    const [segments, setSegments] = useState(() => nativeToSegments(mode, value));
    const segmentsRef = useRef(segments);
    segmentsRef.current = segments;

    const committedRef = useRef(value ?? '');
    const timeoutRef = useRef(null);
    const pendingEmitRef = useRef(null);

    const flushPendingEmit = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        if (pendingEmitRef.current == null) return;
        const next = pendingEmitRef.current;
        pendingEmitRef.current = null;
        emitChange(onChangeRef.current, next);
    }, []);

    const scheduleEmit = useCallback((nativeValue) => {
        pendingEmitRef.current = nativeValue;
        if (timeToWaitInMilli <= 0) {
            flushPendingEmit();
            return;
        }
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(flushPendingEmit, timeToWaitInMilli);
    }, [timeToWaitInMilli, flushPendingEmit]);

    const tryCommitSegments = useCallback((nextSegments) => {
        const native = segmentsToNative(mode, nextSegments);
        if (native !== null) {
            committedRef.current = native;
            scheduleEmit(native);
            return true;
        }
        return false;
    }, [mode, scheduleEmit]);

    useEffect(() => () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }, []);

    useEffect(() => {
        const next = value ?? '';
        if (focusedRef.current) {
            if (next !== '' && next !== committedRef.current) return;
            if (next === committedRef.current) return;
        }
        committedRef.current = next;
        const parsed = nativeToSegments(mode, next);
        segmentsRef.current = parsed;
        setSegments(parsed);
    }, [value, mode]);

    const focusSegment = (key) => {
        const el = inputRefs.current[key];
        if (el) {
            el.focus();
            el.select();
        }
    };

    const nextKey = (key) => {
        const idx = keys.indexOf(key);
        return idx >= 0 && idx < keys.length - 1 ? keys[idx + 1] : null;
    };

    const prevKey = (key) => {
        const idx = keys.indexOf(key);
        return idx > 0 ? keys[idx - 1] : null;
    };

    const updateSegment = (key, raw, { advance = false } = {}) => {
        const sanitized = sanitizeSegmentInput(key, raw);
        const next = { ...segmentsRef.current, [key]: sanitized };
        segmentsRef.current = next;
        setSegments(next);

        if (sanitized.length === maxLengthForSegment(key)) {
            tryCommitSegments(next);
            if (advance) {
                const nk = nextKey(key);
                if (nk) focusSegment(nk);
            }
        }
    };

    const handleSegmentChange = (key) => (e) => {
        updateSegment(key, e.target.value, { advance: true });
    };

    const handleSegmentFocus = (key) => (e) => {
        focusedRef.current = true;
        setIsFocused(true);
        requestAnimationFrame(() => {
            try {
                e.target.select();
            } catch {
                /* ignore */
            }
        });
    };

    const handleSegmentBlur = () => {
        window.setTimeout(() => {
            const active = document.activeElement;
            const stillInside = keys.some((k) => inputRefs.current[k] === active);
            if (stillInside) return;

            focusedRef.current = false;
            setIsFocused(false);

            const native = segmentsToNative(mode, segmentsRef.current);
            if (native !== null) {
                committedRef.current = native;
                scheduleEmit(native);
                return;
            }

            const restored = nativeToSegments(mode, committedRef.current);
            segmentsRef.current = restored;
            setSegments(restored);
        }, 0);
    };

    const handleSegmentKeyDown = (key) => (e) => {
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            const nk = nextKey(key);
            if (nk) focusSegment(nk);
            return;
        }
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const pk = prevKey(key);
            if (pk) focusSegment(pk);
            return;
        }
        if (e.key === 'Backspace' && !segmentsRef.current[key]) {
            e.preventDefault();
            const pk = prevKey(key);
            if (pk) {
                updateSegment(pk, '');
                focusSegment(pk);
            }
        }
    };

    const handlePaste = (key) => (e) => {
        const pasted = e.clipboardData?.getData('text') || '';
        if (!pasted) return;
        e.preventDefault();
        const parsed = parsePastedSegments(mode, pasted);
        if (!parsed) return;
        segmentsRef.current = parsed;
        setSegments(parsed);
        tryCommitSegments(parsed);
        const last = keys[keys.length - 1];
        focusSegment(last);
    };

    const openPicker = (e) => {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        if (disabled) return;
        const el = pickerRef.current;
        if (!el) return;
        try {
            if (typeof el.showPicker === 'function') el.showPicker();
            else el.focus();
        } catch {
            el.focus();
        }
    };

    const handleNativePickerChange = (e) => {
        let native = e.target.value || '';
        if (mode === 'datetime-local' && native.length > 16) {
            native = native.slice(0, 16);
        }
        if (!native) {
            committedRef.current = '';
            segmentsRef.current = { ...EMPTY_SEGMENTS };
            setSegments({ ...EMPTY_SEGMENTS });
            scheduleEmit('');
            return;
        }
        committedRef.current = native;
        const parsed = nativeToSegments(mode, native);
        segmentsRef.current = parsed;
        setSegments(parsed);
        scheduleEmit(native);
    };

    const setContainerRef = (node) => {
        if (typeof ref === 'function') ref(node);
        else if (ref && typeof ref === 'object') ref.current = node;
    };

    const hasDisplay = keys.some((k) => String(segments[k] || '').length > 0);
    const shouldFloat = isFocused || hasDisplay || !!String(value || '').trim();
    const resolvedDir = containerDir || 'rtl';

    const pickerValue = (() => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        if (mode === 'date') {
            const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
            return m ? m[1] : '';
        }
        const m = raw.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
        return m ? m[0] : raw.slice(0, 16);
    })();

    const renderSegment = (key, classSuffix) => (
        <input
            key={key}
            ref={(node) => { inputRefs.current[key] = node; }}
            type="text"
            inputMode="numeric"
            dir="ltr"
            autoComplete="off"
            className={`lw-blockDateInput__segment lw-blockDateInput__segment--${classSuffix}`}
            maxLength={maxLengthForSegment(key)}
            value={segments[key] || ''}
            disabled={disabled}
            aria-label={t(`calendar.${SEGMENT_ARIA[key]}`, key)}
            placeholder={isFocused ? (key === 'yyyy' ? 'yyyy' : key === 'dd' ? 'dd' : key === 'mm' ? 'mm' : key === 'hh' ? 'hh' : 'mm') : ''}
            onChange={handleSegmentChange(key)}
            onFocus={handleSegmentFocus(key)}
            onBlur={handleSegmentBlur}
            onKeyDown={handleSegmentKeyDown(key)}
            onPaste={handlePaste(key)}
        />
    );

    return (
        <SimpleContainer
            ref={setContainerRef}
            dir={resolvedDir}
            className={[
                'lw-blockDateInput',
                shouldFloat ? 'is-floated' : '',
                isFocused ? 'is-focused' : '',
                !hasDisplay && !isFocused ? 'is-empty' : '',
                error ? 'has-error' : '',
                disabled ? 'is-disabled' : '',
                className,
            ].filter(Boolean).join(' ')}
        >
            {title && (
                <SimpleContainer
                    className="lw-blockDateInput__label"
                    style={{
                        borderColor: error ? colors.error : isFocused ? colors.primaryHighlighted : colors.secondaryHighlighted,
                        backgroundColor: disabled ? colors.disabled : colors.white,
                    }}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        if (!disabled) focusSegment(keys[0]);
                    }}
                >
                    {error || title}
                </SimpleContainer>
            )}

            <button
                type="button"
                className="lw-blockDateInput__calendarBtn"
                aria-label={t('calendar.openDatePicker', 'Open calendar')}
                tabIndex={-1}
                disabled={disabled}
                onMouseDown={openPicker}
                onClick={openPicker}
            >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                    <rect x="3" y="4" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                    <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2" />
                </svg>
            </button>

            <div className="lw-blockDateInput__segments">
                {renderSegment('dd', 'dd')}
                <span className="lw-blockDateInput__sep" aria-hidden="true">/</span>
                {renderSegment('mm', 'mm')}
                <span className="lw-blockDateInput__sep" aria-hidden="true">/</span>
                {renderSegment('yyyy', 'yyyy')}
                {mode === 'datetime-local' && (
                    <>
                        <span className="lw-blockDateInput__sep lw-blockDateInput__sep--time" aria-hidden="true" />
                        {renderSegment('hh', 'hh')}
                        <span className="lw-blockDateInput__sep" aria-hidden="true">:</span>
                        {renderSegment('mi', 'mi')}
                    </>
                )}
            </div>

            <input
                ref={pickerRef}
                type={mode === 'datetime-local' ? 'datetime-local' : 'date'}
                className="lw-blockDateInput__nativePicker"
                tabIndex={-1}
                aria-hidden="true"
                disabled={disabled}
                value={pickerValue}
                onChange={handleNativePickerChange}
            />
        </SimpleContainer>
    );
});

export default BlockDateInput;
