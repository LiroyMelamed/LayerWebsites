// src/components/specializedComponents/signFiles/signatureSpots/SignatureSpot.js
import React, { useRef } from "react";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";
import SimpleIcon from "../../../simpleComponents/SimpleIcon";
import { useTranslation } from "react-i18next";
import { signerPaletteClass } from '../../../../utils/signerColorMap';
import { icons } from "../../../../assets/icons/icons";

// Color classes are defined in SCSS and mapped via signerColorClass

export default function SignatureSpot({ spot, index, onUpdateSpot, onRemoveSpot, onRequestRemove, onSelectSpot, onRequestContext, signerIndex = 0, signerName, scale = 1 }) {
    const { t } = useTranslation();
    const ref = useRef(null);

    const longPressRef = useRef({ timer: null, startX: 0, startY: 0, fired: false });
    const LONG_PRESS_MS = 550;
    const MOVE_TOL_PX = 10;

    const canEditSpot = typeof onUpdateSpot === "function";
    const canRemoveSpot = typeof onRemoveSpot === "function";

    const signerNameSafe = signerName || t("signing.spot.defaultSignerName");

    const hasSignatureImage = Boolean(spot?.IsSigned && (spot?.SignatureUrl || spot?.signatureUrl));
    const fieldTypeRaw = spot?.type ?? spot?.fieldType ?? spot?.FieldType ?? 'signature';
    const fieldType = typeof fieldTypeRaw === 'string' ? fieldTypeRaw.toLowerCase() : fieldTypeRaw;
    const isSignatureLike = fieldType === 'signature' || fieldType === 'initials';
    const isRequiredRaw = spot?.isRequired ?? spot?.IsRequired;
    const isRequired = typeof isRequiredRaw === 'boolean' ? isRequiredRaw : isSignatureLike;

    const fieldTypeLabels = {
        signature: t('signing.fields.signature'),
        email: t('signing.fields.email'),
        phone: t('signing.fields.phone'),
        initials: t('signing.fields.initials'),
        text: t('signing.fields.text'),
        date: t('signing.fields.date'),
        checkbox: t('signing.fields.checkbox'),
        number: '#',
        idnumber: t('signing.fields.idNumber'),
    };

    const fieldTypeIcons = {
        signature: icons?.SigningFields?.signature,
        email: icons?.SigningFields?.email,
        phone: icons?.SigningFields?.phone,
        initials: icons?.SigningFields?.initials,
        text: icons?.SigningFields?.text,
        date: icons?.SigningFields?.date,
        checkbox: icons?.SigningFields?.checkbox,
        number: icons?.SigningFields?.idnumber,
        idnumber: icons?.SigningFields?.idnumber,
    };

    const spotStyle = {
        top: (spot.y || 0) * (scale || 1),
        left: (spot.x || 0) * (scale || 1),
        width: (spot.width || 130) * (scale || 1),
        height: (spot.height || 48) * (scale || 1),
        ...(hasSignatureImage ? { backgroundColor: "transparent" } : null),
    };

    // Determine color class using signerUserId fallback to signerIndex
    const signerIdForColor = spot?.signerUserId ?? spot?.SignerUserId ?? spot?.signerIndex ?? spot?.signerIdx ?? signerIndex;
    const colorClass = signerPaletteClass(signerIdForColor);

    const startDragFromClientPoint = (startClientX, startClientY, onEnd) => {
        const startX = Number(startClientX);
        const startY = Number(startClientY);
        const baseX = Number(spot.x || 0);
        const baseY = Number(spot.y || 0);
        const safeScale = scale || 1;

        const moveFromClientPoint = (clientX, clientY) => {
            const dx = Number(clientX) - startX;
            const dy = Number(clientY) - startY;

            onUpdateSpot?.(index, {
                // dx/dy are in screen pixels; convert to base coordinate space.
                x: baseX + dx / safeScale,
                y: baseY + dy / safeScale,
            });
        };

        return { moveFromClientPoint, onEnd };
    };

    const startDragPointer = (e) => {
        // Pointer events support mouse + touch + pen.
        e.preventDefault();
        e.stopPropagation();

        const target = e.currentTarget;
        const pointerId = e.pointerId;

        const { moveFromClientPoint } = startDragFromClientPoint(e.clientX, e.clientY);

        const onPointerMove = (ev) => {
            if (ev.pointerId !== pointerId) return;
            ev.preventDefault();
            moveFromClientPoint(ev.clientX, ev.clientY);
        };

        const stop = (ev) => {
            if (ev && ev.pointerId !== pointerId) return;
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", stop);
            window.removeEventListener("pointercancel", stop);
            try {
                target?.releasePointerCapture?.(pointerId);
            } catch {
                // ignore
            }
        };

        try {
            target?.setPointerCapture?.(pointerId);
        } catch {
            // ignore
        }

        window.addEventListener("pointermove", onPointerMove, { passive: false });
        window.addEventListener("pointerup", stop);
        window.addEventListener("pointercancel", stop);
    };

    const startDragTouchFallback = (e) => {
        // Fallback for browsers without Pointer Events.
        e.preventDefault();
        e.stopPropagation();

        const touch = e.touches?.[0];
        if (!touch) return;

        const { moveFromClientPoint } = startDragFromClientPoint(touch.clientX, touch.clientY);

        const onTouchMove = (ev) => {
            const t = ev.touches?.[0];
            if (!t) return;
            ev.preventDefault();
            moveFromClientPoint(t.clientX, t.clientY);
        };

        const stop = () => {
            window.removeEventListener("touchmove", onTouchMove);
            window.removeEventListener("touchend", stop);
            window.removeEventListener("touchcancel", stop);
        };

        window.addEventListener("touchmove", onTouchMove, { passive: false });
        window.addEventListener("touchend", stop);
        window.addEventListener("touchcancel", stop);
    };

    const clearLongPress = () => {
        const s = longPressRef.current;
        if (s.timer) {
            clearTimeout(s.timer);
            s.timer = null;
        }
        s.fired = false;
    };

    const startLongPressFromClientPoint = (clientX, clientY) => {
        if (typeof onRequestContext !== 'function' && typeof onSelectSpot !== 'function') return;
        const s = longPressRef.current;
        clearLongPress();
        s.startX = Number(clientX);
        s.startY = Number(clientY);
        s.fired = false;
        s.timer = setTimeout(() => {
            s.timer = null;
            s.fired = true;

            // Prefer opening the context menu (same as right-click) on mobile.
            if (typeof onRequestContext === 'function') {
                const pseudoEvent = {
                    type: 'longpress',
                    clientX: s.startX,
                    clientY: s.startY,
                    preventDefault: () => { },
                    stopPropagation: () => { },
                };
                onRequestContext(index, pseudoEvent);
                return;
            }

            // Fallback: open the field editor if context menu isn't wired.
            onSelectSpot?.(index);
        }, LONG_PRESS_MS);
    };

    const maybeCancelLongPressOnMove = (clientX, clientY) => {
        const s = longPressRef.current;
        if (!s.timer) return;
        const dx = Math.abs(Number(clientX) - s.startX);
        const dy = Math.abs(Number(clientY) - s.startY);
        if (dx > MOVE_TOL_PX || dy > MOVE_TOL_PX) {
            clearLongPress();
        }
    };

    // Some API responses include both FieldValue and fieldvalue/fieldValue.
    // Prefer a non-empty value to avoid empty-string masking.
    const pickNonEmpty = (...candidates) => {
        for (const c of candidates) {
            if (c === null || c === undefined) continue;
            const s = String(c);
            if (s.trim().length > 0) return s;
        }
        return "";
    };

    const fieldValue = pickNonEmpty(spot?.fieldValue, spot?.FieldValue, spot?.fieldvalue);
    const hasFieldValue = fieldValue.length > 0;
    const showFieldValue = !isSignatureLike && hasFieldValue;
    const isLtrValueType = fieldType === 'phone' || fieldType === 'email' || fieldType === 'number' || fieldType === 'idnumber' || fieldType === 'date';
    const formatDateForDisplay = (value) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
        const [y, m, d] = value.split('-');
        return `${d}/${m}/${y}`;
    };

    const displayFieldValue = (() => {
        if (!showFieldValue) return "";
        if (fieldType === 'checkbox') return (fieldValue === 'true' ? '✓' : '');
        if (fieldType === 'date') return formatDateForDisplay(fieldValue);
        return fieldValue;
    })();

    return (
        <SimpleContainer
            ref={ref}
            onPointerDown={canEditSpot ? startDragPointer : undefined}
            onTouchStart={
                canEditSpot && typeof window !== "undefined" && !window.PointerEvent
                    ? startDragTouchFallback
                    : undefined
            }
            className={`lw-signing-spot ${colorClass} lw-signing-spot--type-${fieldType} ${isRequired ? 'is-required' : 'is-optional'}`}
            style={spotStyle}
            title={t("signing.spot.signedByTitle", { name: signerNameSafe })}
        >
            <div className="lw-signing-spotMeta">
                <span className="lw-signing-spotType">
                    {fieldTypeIcons[fieldType] && (
                        <SimpleIcon
                            src={fieldTypeIcons[fieldType]}
                            alt={fieldTypeLabels[fieldType] || t('signing.fields.signature')}
                            size={14}
                        />
                    )}
                    <span className="lw-signing-spotTypeLabel">{fieldTypeLabels[fieldType] || t('signing.fields.signature')}</span>
                </span>
                <span className={`lw-signing-spotRequired ${isRequired ? 'is-required' : 'is-optional'}`}>
                    {isRequired ? t('signing.fieldSettings.requiredShort') : t('signing.fieldSettings.optionalShort')}
                </span>
            </div>

            {/* Value renderer (non-signature fields). Must render above click-capture overlay but not block clicks. */}
            {showFieldValue && (
                <div
                    className={`spotValue${isLtrValueType ? ' is-ltr' : ''}`}
                    dir={isLtrValueType ? 'ltr' : undefined}
                    aria-hidden
                >
                    {displayFieldValue}
                </div>
            )}

            {hasSignatureImage ? (
                <img
                    src={spot.SignatureUrl || spot.signatureUrl}
                    alt={t("signing.spot.signatureAlt")}
                    className="lw-signing-spotImg"
                />
            ) : (
                <div className="lw-signing-spotLabel">
                    <div className="lw-signing-spotLabelText">
                        {signerNameSafe.length > 10 ? signerNameSafe.substring(0, 8) + "..." : signerNameSafe}
                    </div>
                </div>
            )}
            {canRemoveSpot && (
                <span
                    onPointerDown={(e) => {
                        e.stopPropagation();
                    }}
                    onMouseDown={(e) => {
                        e.stopPropagation();
                    }}
                    onTouchStart={(e) => {
                        e.stopPropagation();
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (typeof onRequestRemove === 'function') onRequestRemove(index);
                        else onRemoveSpot?.(index);
                    }}
                    className="lw-signing-spotRemove"
                >
                    X
                </span>
            )}
            {/* overlay for editor + context menu */}
            <div
                onClick={(e) => {
                    if (canEditSpot) return;
                    e.stopPropagation();
                    if (typeof onSelectSpot === 'function') onSelectSpot(index);
                }}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (typeof onSelectSpot === 'function') onSelectSpot(index);
                }}
                onPointerDown={(e) => {
                    // Mobile: long-press opens field settings. Keep drag behavior intact.
                    if (!canEditSpot) return;
                    if (!e || e.button === 2) return; // ignore right-click
                    if (e.pointerType && e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
                    startLongPressFromClientPoint(e.clientX, e.clientY);
                }}
                onPointerMove={(e) => {
                    if (!canEditSpot) return;
                    if (e.pointerType && e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
                    maybeCancelLongPressOnMove(e.clientX, e.clientY);
                }}
                onPointerUp={() => {
                    clearLongPress();
                }}
                onPointerCancel={() => {
                    clearLongPress();
                }}
                onTouchStart={(e) => {
                    // Fallback for browsers without Pointer Events.
                    if (!canEditSpot) return;
                    if (typeof window !== 'undefined' && window.PointerEvent) return;
                    const touch = e.touches?.[0];
                    if (!touch) return;
                    startLongPressFromClientPoint(touch.clientX, touch.clientY);
                }}
                onTouchMove={(e) => {
                    if (!canEditSpot) return;
                    if (typeof window !== 'undefined' && window.PointerEvent) return;
                    const touch = e.touches?.[0];
                    if (!touch) return;
                    maybeCancelLongPressOnMove(touch.clientX, touch.clientY);
                }}
                onTouchEnd={() => {
                    clearLongPress();
                }}
                onTouchCancel={() => {
                    clearLongPress();
                }}
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    clearLongPress();
                    if (typeof onRequestContext === 'function') onRequestContext(index, e);
                }}
                aria-hidden
                className="lw-signing-spotOverlay"
            />
        </SimpleContainer>
    );
}
