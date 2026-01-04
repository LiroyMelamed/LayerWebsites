// src/components/specializedComponents/signFiles/signatureSpots/SignatureSpot.js
import React, { useRef } from "react";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";

// Color scheme for different signers
const SIGNER_COLORS = [
    { bg: "rgba(42, 67, 101, 0.14)", border: "#2A4365", name: "ראשי" },       // primary
    { bg: "rgba(76, 102, 144, 0.14)", border: "#4C6690", name: "משני" },      // sidebar selected
    { bg: "rgba(56, 161, 105, 0.14)", border: "#38A169", name: "חיובי" },     // positive
    { bg: "rgba(197, 48, 48, 0.12)", border: "#C53030", name: "שלילי" },      // negative
    { bg: "rgba(113, 128, 150, 0.14)", border: "#718096", name: "אפור" },     // winter
    { bg: "rgba(155, 44, 44, 0.12)", border: "#9B2C2C", name: "אדום כהה" },   // darkRed
];

export default function SignatureSpot({ spot, index, onUpdateSpot, onRemoveSpot, signerIndex = 0, signerName = "חתימה", scale = 1 }) {
    const ref = useRef(null);

    // Get color based on signer index
    const colorScheme = SIGNER_COLORS[signerIndex % SIGNER_COLORS.length];

    const hasSignatureImage = Boolean(spot?.IsSigned && (spot?.SignatureUrl || spot?.signatureUrl));

    const spotStyle = {
        top: (spot.y || 0) * (scale || 1),
        left: (spot.x || 0) * (scale || 1),
        width: (spot.width || 130) * (scale || 1),
        height: (spot.height || 48) * (scale || 1),
        ...(hasSignatureImage ? { backgroundColor: "transparent" } : null),
        "--spot-bg": colorScheme.bg,
        "--spot-border": colorScheme.border,
    };

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
            onPointerDown={startDragPointer}
            onTouchStart={typeof window !== "undefined" && !window.PointerEvent ? startDragTouchFallback : undefined}
            className="lw-signing-spot"
            style={spotStyle}
            title={`חתום על ידי: ${signerName}`}
        >
            {hasSignatureImage ? (
                <img
                    src={spot.SignatureUrl || spot.signatureUrl}
                    alt="signature"
                    className="lw-signing-spotImg"
                />
            ) : (
                <div className="lw-signing-spotLabel">
                    <div className="lw-signing-spotLabelText">
                        ✍️ {signerName.length > 10 ? signerName.substring(0, 8) + "..." : signerName}
                    </div>
                </div>
            )}
            <span
                onClick={(e) => {
                    e.stopPropagation();
                    onRemoveSpot(index);
                }}
                className="lw-signing-spotRemove"
            >
                ✕
            </span>
        </SimpleContainer>
    );
}
