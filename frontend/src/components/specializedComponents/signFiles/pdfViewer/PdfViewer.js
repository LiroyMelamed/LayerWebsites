import React, { useRef, useState } from "react";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";
import SignatureSpotsLayer from "../signatureSpots/SignatureSpotsLayer";
import PdfPage from "./PdfPage";

export default function PdfViewer({
    pdfFile,
    spots,
    onUpdateSpot,
    onRemoveSpot,
}) {
    console.log('pdfFile in PdfViewer:', pdfFile);

    const [pageCount, setPageCount] = useState(0);
    const didInitRef = useRef(false);

    if (!pdfFile) return null;

    const handleLoadTotalPages = (numPages) => {
        if (!didInitRef.current) {
            didInitRef.current = true;
            setPageCount(numPages);
        }
    };

    return (
        <SimpleContainer style={{ width: "100%", position: "relative" }}>
            <SimpleContainer
                style={{ position: "relative", marginBottom: 24 }}
            >
                <PdfPage
                    pdfFile={pdfFile}
                    onLoadTotalPages={handleLoadTotalPages}
                />

                <SignatureSpotsLayer
                    spots={spots}
                    onUpdateSpot={onUpdateSpot}
                    onRemoveSpot={onRemoveSpot}
                />
            </SimpleContainer>
        </SimpleContainer>
    );
}
