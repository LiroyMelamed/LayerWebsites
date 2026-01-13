// src/components/specializedComponents/signFiles/signatureSpots/SignatureSpot.js
import React, { useRef } from "react";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";
import { useTranslation } from "react-i18next";
import { signerColorClass } from '../../../../utils/signerColorMap';

// Color classes are defined in SCSS and mapped via signerColorClass

export default function SignatureSpot({ spot, index, onUpdateSpot, onRemoveSpot, onRequestRemove, onSelectSpot, signerIndex = 0, signerName, scale = 1 }) {
    const { t } = useTranslation();
    const ref = useRef(null);

    const canEditSpot = typeof onUpdateSpot === "function";
    const canRemoveSpot = typeof onRemoveSpot === "function";

    const signerNameSafe = signerName || t("signing.spot.defaultSignerName");

    const hasSignatureImage = Boolean(spot?.IsSigned && (spot?.SignatureUrl || spot?.signatureUrl));

    const spotStyle = {
        top: (spot.y || 0) * (scale || 1),
        left: (spot.x || 0) * (scale || 1),
        width: (spot.width || 130) * (scale || 1),
        height: (spot.height || 48) * (scale || 1),
        ...(hasSignatureImage ? { backgroundColor: "transparent" } : null),
    };

    // Determine color class using signerUserId fallback to signerIndex
    const signerIdForColor = spot?.signerUserId ?? spot?.signerIdx ?? signerIndex;
    const colorClass = signerColorClass(signerIdForColor);

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

    return (
        <SimpleContainer
            ref={ref}
            onPointerDown={canEditSpot ? startDragPointer : undefined}
            onTouchStart={
                canEditSpot && typeof window !== "undefined" && !window.PointerEvent
                    ? startDragTouchFallback
                    : undefined
            }
            className={`lw-signing-spot ${colorClass}`}
            style={spotStyle}
            title={t("signing.spot.signedByTitle", { name: signerNameSafe })}
        >
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
                    {/* allow double-click to open editor */}
                    <div
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (typeof onSelectSpot === 'function') onSelectSpot(index);
                        }}
                        style={{ position: 'absolute', inset: 0 }}
                    />
        </SimpleContainer>
    );
}
