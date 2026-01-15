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
    onRequestRemove,
    onSelectSpot,
    onRequestContext,
    onAddSpotForPage,
    signers = [],
    onPageChange,
}) {
    // translation not needed in this viewer component for commit (1)
    const [numPages, setNumPages] = useState(0);
    const didInitRef = useRef(false);

    const pageContainerRef = useRef(null);
    const viewerRef = useRef(null);
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

    useEffect(() => {
        const container = viewerRef.current;
        if (!container || typeof onPageChange !== 'function') return;

        const pages = Array.from(container.querySelectorAll('[data-page-number]'));
        if (!pages.length) {
            onPageChange(1);
            return;
        }

        let activePage = null;
        const ratios = new Map();
        const useContainerAsRoot = container.scrollHeight > container.clientHeight + 1;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    const pageNumber = Number(entry.target.getAttribute('data-page-number')) || 1;
                    ratios.set(pageNumber, entry.intersectionRatio);
                });

                let best = null;
                ratios.forEach((ratio, pageNumber) => {
                    if (!best || ratio > best.ratio) {
                        best = { pageNumber, ratio };
                    }
                });

                if (best && best.ratio > 0 && best.pageNumber !== activePage) {
                    activePage = best.pageNumber;
                    onPageChange(best.pageNumber);
                }
            },
            {
                root: useContainerAsRoot ? container : null,
                threshold: [0, 0.25, 0.5, 0.75, 1],
            }
        );

        pages.forEach((page) => observer.observe(page));
        return () => observer.disconnect();
    }, [onPageChange, numPages, pdfFile]);

    const renderWidth = useMemo(() => {
        // Keep same coordinate system across app: spots are stored in BASE_RENDER_WIDTH space.
        // Render PDF at whatever width is available (up to BASE_RENDER_WIDTH), and scale spots accordingly.
        const safe = Math.max(280, containerWidth || BASE_RENDER_WIDTH);
        return Math.min(BASE_RENDER_WIDTH, Math.floor(safe));
    }, [containerWidth]);

    const spotScale = useMemo(() => renderWidth / BASE_RENDER_WIDTH, [renderWidth]);

    useEffect(() => {
        if (!pageContainerRef.current) return;
        pageContainerRef.current.style.setProperty('--lw-pdf-render-width', `${renderWidth}px`);
    }, [renderWidth]);

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
        <SimpleContainer className="lw-signing-pdfViewer" ref={viewerRef}>
            {Array.from({ length: pagesToRender }).map((_, i) => {
                const pageNumber = i + 1;

                return (
                    <SimpleContainer
                        key={pageNumber}
                        ref={pageNumber === 1 ? pageContainerRef : undefined}
                        className="lw-signing-pageWrap"
                    >


                        <SimpleContainer
                            className="lw-signing-pageInner"
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
                                onRequestRemove={onRequestRemove}
                                onSelectSpot={onSelectSpot}
                                onRequestContext={onRequestContext}
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
