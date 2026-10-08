import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import SegmentedSwitch from '../../../components/styledComponents/SegmentedSwitch';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';

const WIDTH = 600, HEIGHT = 200;
const INK = '#1a2b6d';
const SCRIPT_FONT = '"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive';

// Pixels stay within the server limits (2400px per side, 300KB) at any device ratio.
const ratio = () => Math.min(2, Math.max(1, window.devicePixelRatio || 1));

function typedPng(name, direction) {
    const canvas = document.createElement('canvas'), scale = ratio();
    canvas.width = WIDTH * scale; canvas.height = HEIGHT * scale;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.scale(scale, scale);
    context.direction = direction;
    context.fillStyle = INK; context.textAlign = 'center'; context.textBaseline = 'middle';
    let size = 64;
    do { context.font = `italic ${size}px ${SCRIPT_FONT}`; size -= 4; } while (size > 20 && context.measureText(name).width > WIDTH - 40);
    context.fillText(name, WIDTH / 2, HEIGHT / 2);
    return canvas.toDataURL('image/png').split(',')[1] || null;
}

const SignaturePad = forwardRef(function SignaturePad({ t, direction, id, defaultName = '', error, onReadyChange }, ref) {
    const [mode, setMode] = useState('draw');
    const [typed, setTyped] = useState(defaultName);
    const [inked, setInked] = useState(false);
    const canvas = useRef(null), last = useRef(null);
    const errorId = error ? `${id}-error` : undefined;

    const context = useCallback(() => canvas.current?.getContext('2d') || null, []);
    const reset = useCallback(() => {
        const element = canvas.current, scale = ratio(), drawing = context();
        if (!element || !drawing) return;
        element.width = WIDTH * scale; element.height = HEIGHT * scale;
        drawing.setTransform(scale, 0, 0, scale, 0, 0);
        drawing.lineWidth = 2.5; drawing.lineCap = 'round'; drawing.lineJoin = 'round'; drawing.strokeStyle = INK;
        setInked(false);
    }, [context]);
    useEffect(() => { if (mode === 'draw') reset(); }, [mode, reset]);
    useEffect(() => { onReadyChange?.(mode === 'draw' ? inked : typed.trim().length > 0); }, [mode, inked, typed, onReadyChange]);

    const point = event => {
        const box = canvas.current.getBoundingClientRect();
        return { x: (event.clientX - box.left) * WIDTH / box.width, y: (event.clientY - box.top) * HEIGHT / box.height };
    };
    const down = event => {
        event.preventDefault();
        // Capture throws for a pointer the browser no longer tracks; the stroke still works without it.
        try { canvas.current.setPointerCapture?.(event.pointerId); } catch { /* not capturable */ }
        last.current = point(event);
        const drawing = context();
        if (!drawing) return;
        drawing.beginPath(); drawing.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2); drawing.fillStyle = INK; drawing.fill();
    };
    const move = event => {
        if (!last.current) return;
        const next = point(event), drawing = context();
        if (!drawing) return;
        drawing.beginPath(); drawing.moveTo(last.current.x, last.current.y); drawing.lineTo(next.x, next.y); drawing.stroke();
        last.current = next;
        if (!inked) setInked(true);
    };
    const up = () => { last.current = null; };

    useImperativeHandle(ref, () => ({
        toPng: () => {
            if (mode === 'type') return typed.trim() ? typedPng(typed.trim(), direction) : null;
            return inked ? canvas.current.toDataURL('image/png').split(',')[1] || null : null;
        },
        focus: () => (mode === 'type' ? document.getElementById(`${id}-typed`) : document.querySelector(`#${id}-mode button`))?.focus(),
    }), [mode, typed, inked, direction, id]);

    return <div className={`lw-publicSign__pad${error ? ' is-invalid' : ''}`} id={id} role="group" aria-labelledby={`${id}-label`} aria-describedby={errorId}>
        <div className="lw-publicSign__padHead">
            <span id={`${id}-label`} className="lw-publicSign__padLabel">{t('signingV2.public.sign.padLabel')}</span>
            <div id={`${id}-mode`}>
                <SegmentedSwitch value={mode} onChange={setMode} ariaLabel={t('signingV2.public.sign.mode')}
                    options={[{ value: 'draw', label: t('signingV2.public.sign.draw') }, { value: 'type', label: t('signingV2.public.sign.type') }]} />
            </div>
        </div>
        {mode === 'draw' ? <>
            <canvas ref={canvas} className="lw-publicSign__canvas" role="img" aria-label={t('signingV2.public.sign.canvas')}
                onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
            <div className="lw-publicSign__padFoot">
                <small>{t('signingV2.public.sign.drawHelp')}</small>
                <SecondaryButton onPress={reset} disabled={!inked}>{t('signingV2.public.sign.clear')}</SecondaryButton>
            </div>
        </> : <div className="lw-signingCompose__field">
            <label htmlFor={`${id}-typed`}>{t('signingV2.public.sign.typedName')}</label>
            <input id={`${id}-typed`} dir={direction} value={typed} maxLength={80} autoComplete="name" onChange={event => setTyped(event.target.value)}
                aria-describedby={`${id}-typed-help`} />
            <small id={`${id}-typed-help`}>{t('signingV2.public.sign.typeHelp')}</small>
            {typed.trim() && <p className="lw-publicSign__typedPreview" dir={direction} aria-hidden="true" style={{ fontFamily: SCRIPT_FONT }}>{typed}</p>}
        </div>}
        {error && <small id={errorId} className="lw-signingCompose__fieldError">{error}</small>}
    </div>;
});

export default SignaturePad;
