// src/components/specializedComponents/signFiles/signatureSpots/SignatureSpot.js
import React, { useRef } from "react";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";

// Color scheme for different signers
const SIGNER_COLORS = [
    { bg: "rgba(25, 118, 210, 0.15)", border: "#1976d2", name: "כחול" },      // Blue
    { bg: "rgba(211, 47, 47, 0.15)", border: "#d32f2f", name: "אדום" },       // Red
    { bg: "rgba(56, 142, 60, 0.15)", border: "#388e3c", name: "ירוק" },       // Green
    { bg: "rgba(251, 140, 0, 0.15)", border: "#fb8c00", name: "כתום" },       // Orange
    { bg: "rgba(123, 31, 162, 0.15)", border: "#7b1fa2", name: "סגול" },      // Purple
    { bg: "rgba(0, 150, 136, 0.15)", border: "#009688", name: "טורקיז" },     // Teal
];

export default function SignatureSpot({ spot, index, onUpdateSpot, onRemoveSpot, signerIndex = 0, signerName = "חתימה", scale = 1 }) {
    const ref = useRef(null);

    // Get color based on signer index
    const colorScheme = SIGNER_COLORS[signerIndex % SIGNER_COLORS.length];

    const hasSignatureImage = Boolean(spot?.IsSigned && (spot?.SignatureUrl || spot?.signatureUrl));

    const startDrag = (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;

        const move = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;

            onUpdateSpot(index, {
                // dx/dy are in screen pixels; convert to base coordinate space.
                x: spot.x + dx / (scale || 1),
                y: spot.y + dy / (scale || 1),
            });
        };

        const stop = () => {
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", stop);
        };

        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", stop);
    };

    return (
        <SimpleContainer
            ref={ref}
            onMouseDown={startDrag}
            className="lw-signing-spot"
            style={{
                top: (spot.y || 0) * (scale || 1),
                left: (spot.x || 0) * (scale || 1),
                width: ((spot.width || 130) * (scale || 1)),
                height: ((spot.height || 48) * (scale || 1)),
                ...(hasSignatureImage ? { backgroundColor: "transparent" } : null),
                "--spot-bg": colorScheme.bg,
                "--spot-border": colorScheme.border,
            }}
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
