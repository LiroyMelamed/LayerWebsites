// src/components/specializedComponents/signFiles/signatureSpots/SignatureSpot.js
import React, { useRef } from "react";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";

export default function SignatureSpot({ spot, index, onUpdateSpot, onRemoveSpot }) {
    const ref = useRef(null);

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
                width: 140,
                height: 50,
                backgroundColor: "rgba(25,118,210,0.15)",
                border: "2px dashed #1976d2",
                borderRadius: 6,
                cursor: "move",
                pointerEvents: "auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 600,
            }}
        >
            ✍️ חתימה
            <span
                onClick={(e) => {
                    e.stopPropagation();
                    onRemoveSpot(index);
                }}
                style={{
                    position: "absolute",
                    top: -8,
                    right: -8,
                    width: 18,
                    height: 18,
                    backgroundColor: "#f44336",
                    color: "#fff",
                    borderRadius: "50%",
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                }}
            >
                ✕
            </span>
        </SimpleContainer>
    );
}
