import React, { useEffect, useRef, useState } from "react";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";
import PdfPage from "./PdfPage";
import SignatureSpotsLayer from "../signatureSpots/SignatureSpotsLayer";
import SecondaryButton from "../../../styledComponents/buttons/SecondaryButton";

export default function PdfViewer({
    pdfFile,
    spots = [],
    onUpdateSpot,
    onRemoveSpot,
    onAddSpotForPage,
}) {

    console.log('PdfViewer spots:', spots);

    const [numPages, setNumPages] = useState(0);
    const didInitRef = useRef(false);

    useEffect(() => {
        didInitRef.current = false;
        setNumPages(0);
    }, [pdfFile]);

    const handleLoadTotalPages = (pages) => {
        if (!didInitRef.current) {
            didInitRef.current = true;
            setNumPages(pages || 0);
        }
    };

    const pagesToRender = numPages > 0 ? numPages : 1;

    if (!pdfFile) return null;

    return (
        <SimpleContainer style={{ width: "100%", position: "relative", flexDirection: "column", alignItems: "center" }}>
            {Array.from({ length: pagesToRender }).map((_, i) => {
                const pageNumber = i + 1;

                return (
                    <SimpleContainer
                        key={pageNumber}
                        style={{
                            width: "100%",
                            maxWidth: 900,
                            position: "relative",
                            marginBottom: 24,
                            flexDirection: "column",
                            alignItems: "center",
                        }}
                    >
                        <SimpleContainer style={{ width: "100%", justifyContent: "flex-end", marginBottom: 8 }}>
                            <SecondaryButton
                                onPress={() => onAddSpotForPage(pageNumber)}
                            >
                                + הוסף חתימה לעמוד {pageNumber}
                            </SecondaryButton>
                        </SimpleContainer>

                        <SimpleContainer style={{ width: "100%", position: "relative", justifyContent: "center" }}>
                            <PdfPage
                                pdfFile={pdfFile}
                                pageNumber={pageNumber}
                                onLoadTotalPages={handleLoadTotalPages}
                            />

                            <SignatureSpotsLayer
                                pageNumber={pageNumber}
                                spots={spots}
                                onUpdateSpot={onUpdateSpot}
                                onRemoveSpot={onRemoveSpot}
                            />
                        </SimpleContainer>
                    </SimpleContainer>
                );
            })}
        </SimpleContainer>
    );
}
