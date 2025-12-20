// src/components/specializedComponents/signFiles/signatureSpots/SignatureSpotsLayer.js
import React from "react";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";
import SignatureSpot from "./SignatureSpot";

export default function SignatureSpotsLayer({
    pageNumber,
    spots = [],
    onUpdateSpot,
    onRemoveSpot,
    signers = [],
}) {
    // Helper to get signer info from signerIndex or signerName
    const getSignerInfo = (spot) => {
        const spotSignerUserId = spot?.signerUserId ?? spot?.SignerUserId;

        let signerIndex = -1;
        if (spotSignerUserId !== undefined && spotSignerUserId !== null) {
            signerIndex = signers.findIndex(
                (s) => Number(s?.UserId ?? s?.userId) === Number(spotSignerUserId)
            );
        }

        if (signerIndex < 0 && spot.signerIndex !== undefined) {
            signerIndex = spot.signerIndex;
        }

        const signer = signerIndex >= 0 ? signers[signerIndex] : null;

        return {
            signerIndex: signerIndex >= 0 ? signerIndex : 0,
            // Prefer backend-provided name (it matched against PDF text)
            signerName:
                spot.signerName ||
                signer?.Name ||
                signer?.name ||
                (signerIndex >= 0 ? `חותם ${signerIndex + 1}` : "חתימה"),
        };
    };

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
                .sort((a, b) => (a.y || 0) - (b.y || 0))  // Sort by Y ascending (frontend coords: lower Y = top of page)
                .map((spot) => {
                    const signerInfo = getSignerInfo(spot);
                    return (
                        <SignatureSpot
                            key={spot.originalIndex}
                            spot={spot}
                            index={spot.originalIndex}
                            onUpdateSpot={onUpdateSpot}
                            onRemoveSpot={onRemoveSpot}
                            signerIndex={signerInfo.signerIndex}
                            signerName={signerInfo.signerName}
                        />
                    );
                })}
        </SimpleContainer>
    );
}
