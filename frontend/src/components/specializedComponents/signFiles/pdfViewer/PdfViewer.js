import React, { useEffect, useMemo, useRef, useState } from "react";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";
import PdfPage from "./PdfPage";
import SignatureSpotsLayer from "../signatureSpots/SignatureSpotsLayer";

const BASE_RENDER_WIDTH = 800;

export default function PdfViewer({
    pdfFile,
    spots = [],
    onUpdateSpot,
    onRemoveSpot,
    onAddSpotForPage,
    signers = [],
}) {
    // translation not needed in this viewer component for commit (1)
    const [numPages, setNumPages] = useState(0);
    const didInitRef = useRef(false);

    const pageContainerRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(BASE_RENDER_WIDTH);

    useEffect(() => {
        const el = pageContainerRef.current;
        if (!el) return;

        const update = () => {
            const w = el.getBoundingClientRect().width;
            if (w && Number.isFinite(w)) setContainerWidth(w);
        };

        update();

        let ro;
        if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(() => update());
            ro.observe(el);
        } else {
            window.addEventListener("resize", update);
        }

        return () => {
            if (ro) ro.disconnect();
            else window.removeEventListener("resize", update);
        };
    }, []);

    const renderWidth = useMemo(() => {
        // Keep same coordinate system across app: spots are stored in BASE_RENDER_WIDTH space.
        // Render PDF at whatever width is available (up to BASE_RENDER_WIDTH), and scale spots accordingly.
        const safe = Math.max(280, containerWidth || BASE_RENDER_WIDTH);
        return Math.min(BASE_RENDER_WIDTH, Math.floor(safe));
    }, [containerWidth]);

    const spotScale = useMemo(() => renderWidth / BASE_RENDER_WIDTH, [renderWidth]);

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
        <SimpleContainer className="lw-signing-pdfViewer">
            {Array.from({ length: pagesToRender }).map((_, i) => {
                const pageNumber = i + 1;
                const pageInnerStyle = { width: "100%", maxWidth: renderWidth };

                return (
                    <SimpleContainer
                        key={pageNumber}
                        ref={pageNumber === 1 ? pageContainerRef : undefined}
                        className="lw-signing-pageWrap"
                    >
                        

                        <SimpleContainer
                            className="lw-signing-pageInner"
                            style={pageInnerStyle /* runtime dynamic: page sizing/scale depends on viewport + zoom */}
                            data-page-number={pageNumber}
                        >
                            <PdfPage
                                pdfFile={pdfFile}
                                pageNumber={pageNumber}
                                onLoadTotalPages={handleLoadTotalPages}
                                renderWidth={renderWidth}
                            />

                            <SignatureSpotsLayer
                                pageNumber={pageNumber}
                                spots={spots}
                                onUpdateSpot={onUpdateSpot}
                                onRemoveSpot={onRemoveSpot}
                                signers={signers}
                                scale={spotScale}
                            />
                        </SimpleContainer>
                    </SimpleContainer>
                );
            })}
        </SimpleContainer>
    );
}
