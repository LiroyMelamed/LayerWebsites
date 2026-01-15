// src/components/specializedComponents/signFiles/signatureSpots/SignatureSpotsLayer.js
import React from "react";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";
import SignatureSpot from "./SignatureSpot";
import { useTranslation } from 'react-i18next';

export default function SignatureSpotsLayer({
    pageNumber,
    spots = [],
    onUpdateSpot,
    onRemoveSpot,
    onRequestRemove,
    onSelectSpot,
    onRequestContext,
    signers = [],
    scale = 1,
}) {
    const { t } = useTranslation();
    const normalizeSpot = (spot) => {
        if (!spot || typeof spot !== "object") return spot;

        const pickNonEmpty = (...candidates) => {
            for (const c of candidates) {
                if (c === null || c === undefined) continue;
                const s = String(c);
                if (s.trim().length > 0) return s;
            }
            return undefined;
        };

        // Backend uses PascalCase (PageNumber/X/Y/SignerName...), upload flow uses camelCase (pageNum/x/y/signerName...)
        const pageNum = spot.pageNum ?? spot.PageNumber ?? spot.pagenumber;
        const x = spot.x ?? spot.X;
        const y = spot.y ?? spot.Y;
        const width = spot.width ?? spot.Width;
        const height = spot.height ?? spot.Height;
        const signerName = spot.signerName ?? spot.SignerName;
        const signerUserId = spot.signerUserId ?? spot.SignerUserId;
        const signerIndex = spot.signerIndex ?? spot.SignerIndex;
        const typeRaw = spot.type ?? spot.fieldType ?? spot.FieldType ?? spot.fieldtype;
        const type = typeof typeRaw === 'string' ? typeRaw.toLowerCase() : typeRaw;
        const isRequiredRaw = spot.isRequired ?? spot.IsRequired;
        const isRequired = typeof isRequiredRaw === 'boolean'
            ? isRequiredRaw
            : (type === 'signature' || type === 'initials');
        const fieldLabel = spot.fieldLabel ?? spot.FieldLabel ?? spot.fieldlabel;
        const fieldValue = pickNonEmpty(spot.fieldValue, spot.FieldValue, spot.fieldvalue);

        return {
            ...spot,
            pageNum,
            x,
            y,
            width,
            height,
            signerName,
            signerUserId,
            signerIndex,
            type,
            isRequired,
            fieldLabel,
            fieldValue,
        };
    };

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
                (signerIndex >= 0
                    ? t('signing.signerFallback', { index: signerIndex + 1 })
                    : t('signing.spot.defaultSignerName')),
        };
    };

    return (
        <SimpleContainer
            className="lw-signing-spotsLayer"
        >
            {spots
                .map((s, originalIndex) => ({ ...normalizeSpot(s), originalIndex }))
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
                            onRequestRemove={onRequestRemove}
                            onSelectSpot={onSelectSpot}
                            onRequestContext={onRequestContext}
                            signerIndex={signerInfo.signerIndex}
                            signerName={signerInfo.signerName}
                            scale={scale}
                        />
                    );
                })}
        </SimpleContainer>
    );
}
