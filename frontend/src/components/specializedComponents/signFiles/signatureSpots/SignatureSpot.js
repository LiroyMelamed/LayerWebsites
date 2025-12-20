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

export default function SignatureSpot({ spot, index, onUpdateSpot, onRemoveSpot, signerIndex = 0, signerName = "חתימה" }) {
    const ref = useRef(null);

    // Get color based on signer index
    const colorScheme = SIGNER_COLORS[signerIndex % SIGNER_COLORS.length];

    const startDrag = (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;

        const move = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;

            onUpdateSpot(index, {
                x: spot.x + dx,
                y: spot.y + dy,
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
            style={{
                position: "absolute",
                top: spot.y,
                left: spot.x,
                width: 130,
                height: 48,
                backgroundColor: colorScheme.bg,
                border: `2.5px solid ${colorScheme.border}`,
                borderRadius: 5,
                cursor: "move",
                pointerEvents: "auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                flexDirection: "column",
                color: colorScheme.border,
                boxShadow: `0 2px 8px ${colorScheme.border}33`,
                transition: "box-shadow 0.2s ease",
            }}
            title={`חתום על ידי: ${signerName}`}
        >
            <div style={{ textAlign: "center", lineHeight: "1.3", padding: "2px 4px" }}>
                <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                    ✍️ {signerName.length > 10 ? signerName.substring(0, 8) + "..." : signerName}
                </div>
            </div>
            <span
                onClick={(e) => {
                    e.stopPropagation();
                    onRemoveSpot(index);
                }}
                style={{
                    position: "absolute",
                    top: -10,
                    right: -10,
                    width: 20,
                    height: 20,
                    backgroundColor: "#f44336",
                    color: "#fff",
                    borderRadius: "50%",
                    fontSize: 13,
                    fontWeight: "bold",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                    border: "2px solid white",
                }}
            >
                ✕
            </span>
        </SimpleContainer>
    );
}
