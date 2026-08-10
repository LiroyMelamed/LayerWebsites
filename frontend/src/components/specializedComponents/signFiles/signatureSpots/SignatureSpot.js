// src/components/specializedComponents/signFiles/signatureSpots/SignatureSpot.js
import React, { useRef } from "react";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";
import SimpleIcon from "../../../simpleComponents/SimpleIcon";
import { useTranslation } from "react-i18next";
import { signerPaletteClassByIndex } from '../../../../utils/signerColorMap';
import { icons } from "../../../../assets/icons/icons";

// Color classes are defined in SCSS (lw-signer-palette-N) and keyed by signer index

export default function SignatureSpot({ spot, index, onUpdateSpot, onRemoveSpot, onRequestRemove, onSelectSpot, onRequestContext, signerIndex = 0, signerName, scale = 1, isSelected = false }) {
    const { t } = useTranslation();
    const ref = useRef(null);

    const dragMovedRef = useRef(false);
    const pointerStartRef = useRef({ x: 0, y: 0 });
    const DRAG_THRESHOLD_PX = 8;

    const canEditSpot = typeof onUpdateSpot === "function";
    const canRemoveSpot = typeof onRemoveSpot === "function";

    const signerNameSafe = signerName || t("signing.spot.defaultSignerName");

    const hasSignatureImage = Boolean(spot?.IsSigned && (spot?.SignatureUrl || spot?.signatureUrl));
    const fieldTypeRaw = spot?.type ?? spot?.fieldType ?? spot?.FieldType ?? 'signature';
    const fieldType = typeof fieldTypeRaw === 'string' ? fieldTypeRaw.toLowerCase() : fieldTypeRaw;
    const isSignatureLike = fieldType === 'signature' || fieldType === 'initials';
    const isLawyerStamp = fieldType === 'lawyerstamp';
    const isClientStamp = fieldType === 'clientstamp';
    const isStampType = isLawyerStamp || isClientStamp;
    const stampImageUrl = spot?.stampImageDataUrl || spot?.StampImageDataUrl;
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
        lawyerstamp: t('signing.fields.lawyerStamp'),
        clientstamp: t('signing.fields.clientStamp'),
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
        // Physical left edge of the PDF page (never RTL logical inset).
        left: (spot.x || 0) * (scale || 1),
        right: "auto",
        insetInlineStart: "auto",
        insetInlineEnd: "auto",
        width: (spot.width || 130) * (scale || 1),
        height: (spot.height || 48) * (scale || 1),
        ...(hasSignatureImage ? { backgroundColor: "transparent" } : null),
    };

    // Color by signer ordinal in the document (0,1,2…) — never hash user ids
    // (hashing into 4 slots made different signers share the same amber/tan).
    const colorClass = signerPaletteClassByIndex(signerIndex);

    const startDragFromClientPoint = (startClientX, startClientY) => {
        const startX = Number(startClientX);
        const startY = Number(startClientY);
        const baseX = Number(spot.x || 0);
        const baseY = Number(spot.y || 0);
        const basePage = Number(spot.pageNum ?? spot.PageNumber ?? 1) || 1;
        const safeScale = scale || 1;
        const spotW = Number(spot.width || 130);
        const spotH = Number(spot.height || 48);

        const startPageEl = document.querySelector(`.lw-signing-pageInner[data-page-number="${basePage}"]`);
        const startRect = startPageEl?.getBoundingClientRect();
        let grabOffsetX = startRect ? startX - (startRect.left + baseX * safeScale) : 0;
        let grabOffsetY = startRect ? startY - (startRect.top + baseY * safeScale) : 0;
        let lastPageNumber = basePage;

        const findPageUnderPoint = (clientX, clientY) => {
            const hit = document.elementsFromPoint(clientX, clientY)
                .map((el) => el?.closest?.(".lw-signing-pageInner"))
                .find(Boolean);
            if (hit) return hit;

            // Between-page gutters: snap to nearest page by vertical distance
            // so spots can keep moving across pages.
            const pages = Array.from(document.querySelectorAll(".lw-signing-pageInner[data-page-number]"));
            let best = null;
            let bestDist = Infinity;
            for (const page of pages) {
                const rect = page.getBoundingClientRect();
                let dist = 0;
                if (clientY < rect.top) dist = rect.top - clientY;
                else if (clientY > rect.bottom) dist = clientY - rect.bottom;
                // Prefer a page the cursor is horizontally over when close in Y.
                if (clientX < rect.left || clientX > rect.right) {
                    dist += Math.min(Math.abs(clientX - rect.left), Math.abs(clientX - rect.right));
                }
                if (dist < bestDist) {
                    bestDist = dist;
                    best = page;
                }
            }
            return best;
        };

        const moveFromClientPoint = (clientX, clientY) => {
            const pageEl = findPageUnderPoint(clientX, clientY) || startPageEl;
            if (!pageEl) {
                onUpdateSpot?.(index, {
                    x: baseX + (Number(clientX) - startX) / safeScale,
                    y: baseY + (Number(clientY) - startY) / safeScale,
                });
                return;
            }

            const pageNumber = Number(pageEl.getAttribute("data-page-number")) || basePage;
            const rect = pageEl.getBoundingClientRect();

            // When crossing onto another page, re-anchor the grab offset so the
            // spot doesn't jump (page boxes used to differ in width).
            if (pageNumber !== lastPageNumber) {
                grabOffsetX = Math.max(0, Math.min(Number(clientX) - rect.left, spotW * safeScale));
                grabOffsetY = Math.max(0, Math.min(Number(clientY) - rect.top, spotH * safeScale));
                lastPageNumber = pageNumber;
            }

            const pageW = rect.width / safeScale;
            const pageH = rect.height / safeScale;
            const nextX = (Number(clientX) - rect.left - grabOffsetX) / safeScale;
            const nextY = (Number(clientY) - rect.top - grabOffsetY) / safeScale;
            const clampedX = Math.max(0, Math.min(nextX, Math.max(0, pageW - spotW)));
            const clampedY = Math.max(0, Math.min(nextY, Math.max(0, pageH - spotH)));

            onUpdateSpot?.(index, {
                x: clampedX,
                y: clampedY,
                pageNum: pageNumber,
                PageNumber: pageNumber,
            });
        };

        return { moveFromClientPoint };
    };

    /**
     * Drag MUST start from the top overlay (not the spot root).
     * On iOS, touching child labels without touch-action:none lets the PDF
     * scroll parent steal the gesture — which looked like "can't drag at all".
     */
    const startDragPointer = (e) => {
        if (!canEditSpot) return;
        if (e.button != null && e.button !== 0) return;

        e.preventDefault();
        e.stopPropagation();

        dragMovedRef.current = false;
        pointerStartRef.current = { x: Number(e.clientX), y: Number(e.clientY) };

        const target = e.currentTarget;
        const pointerId = e.pointerId;
        const { moveFromClientPoint } = startDragFromClientPoint(e.clientX, e.clientY);

        const onPointerMove = (ev) => {
            if (ev.pointerId !== pointerId) return;
            ev.preventDefault();
            const dx = Math.abs(Number(ev.clientX) - pointerStartRef.current.x);
            const dy = Math.abs(Number(ev.clientY) - pointerStartRef.current.y);
            if (dx <= DRAG_THRESHOLD_PX && dy <= DRAG_THRESHOLD_PX) return;
            dragMovedRef.current = true;
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
            // Deliberate tap only (no drag) → open field settings.
            if (!dragMovedRef.current && typeof onSelectSpot === 'function') {
                onSelectSpot(index);
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
        if (!canEditSpot) return;
        e.preventDefault();
        e.stopPropagation();

        const touch = e.touches?.[0];
        if (!touch) return;

        dragMovedRef.current = false;
        pointerStartRef.current = { x: Number(touch.clientX), y: Number(touch.clientY) };
        const { moveFromClientPoint } = startDragFromClientPoint(touch.clientX, touch.clientY);

        const onTouchMove = (ev) => {
            const t = ev.touches?.[0];
            if (!t) return;
            ev.preventDefault();
            const dx = Math.abs(Number(t.clientX) - pointerStartRef.current.x);
            const dy = Math.abs(Number(t.clientY) - pointerStartRef.current.y);
            if (dx <= DRAG_THRESHOLD_PX && dy <= DRAG_THRESHOLD_PX) return;
            dragMovedRef.current = true;
            moveFromClientPoint(t.clientX, t.clientY);
        };

        const stop = () => {
            window.removeEventListener("touchmove", onTouchMove);
            window.removeEventListener("touchend", stop);
            window.removeEventListener("touchcancel", stop);
            if (!dragMovedRef.current && typeof onSelectSpot === 'function') {
                onSelectSpot(index);
            }
        };

        window.addEventListener("touchmove", onTouchMove, { passive: false });
        window.addEventListener("touchend", stop);
        window.addEventListener("touchcancel", stop);
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

    const isSigned = Boolean(spot?.IsSigned);

    return (
        <SimpleContainer
            ref={ref}
            className={`lw-signing-spot ${colorClass} lw-signing-spot--type-${fieldType} ${isRequired ? 'is-required' : 'is-optional'}${isSigned ? ' is-signed' : ''}${isSelected ? ' is-selected' : ''}${canEditSpot ? ' is-editable' : ''}`}
            style={spotStyle}
            title={t("signing.spot.signedByTitle", { name: signerNameSafe })}
        >
            {!isSigned && (
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
            )}

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

            {isStampType && stampImageUrl ? (
                <img
                    src={stampImageUrl}
                    alt={isClientStamp ? t("signing.fields.clientStamp") : t("signing.fields.lawyerStamp")}
                    className="lw-signing-spotImg lw-signing-spotImg--stamp"
                    draggable={false}
                />
            ) : hasSignatureImage ? (
                <img
                    src={spot.SignatureUrl || spot.signatureUrl}
                    alt={t("signing.spot.signatureAlt")}
                    className="lw-signing-spotImg"
                    draggable={false}
                />
            ) : !showFieldValue && (
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
            {/* Top hit-layer: owns drag on edit, select on client. touch-action:none is critical on iOS. */}
            {!isSigned && (
            <div
                onPointerDown={canEditSpot ? startDragPointer : undefined}
                onTouchStart={
                    canEditSpot && typeof window !== "undefined" && !window.PointerEvent
                        ? startDragTouchFallback
                        : undefined
                }
                onClick={(e) => {
                    if (canEditSpot) return; // edit mode uses pointerup tap detection
                    e.stopPropagation();
                    if (typeof onSelectSpot === 'function') onSelectSpot(index);
                }}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (typeof onSelectSpot === 'function') onSelectSpot(index);
                }}
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof onRequestContext === 'function') onRequestContext(index, e);
                }}
                aria-hidden
                className={`lw-signing-spotOverlay${canEditSpot ? ' lw-signing-spotOverlay--drag' : ''}`}
            />
            )}
        </SimpleContainer>
    );
}
