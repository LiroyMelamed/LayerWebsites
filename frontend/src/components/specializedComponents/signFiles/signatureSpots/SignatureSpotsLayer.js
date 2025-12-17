// src/components/specializedComponents/signFiles/signatureSpots/SignatureSpotsLayer.js
import React from "react";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";
import SignatureSpot from "./SignatureSpot";

export default function SignatureSpotsLayer({
    pageNumber,
    spots = [],
    onUpdateSpot,
    onRemoveSpot,
}) {
    return (
        <SimpleContainer
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                pointerEvents: "none",
            }}
        >
            {spots
                .map((s, originalIndex) => ({ ...s, originalIndex }))
                .filter((s) => Number(s.pageNum) === Number(pageNumber))
                .map((spot) => (
                    <SignatureSpot
                        key={spot.originalIndex}
                        spot={spot}
                        index={spot.originalIndex}
                        onUpdateSpot={onUpdateSpot}
                        onRemoveSpot={onRemoveSpot}
                    />
                ))}
        </SimpleContainer>
    );
}
