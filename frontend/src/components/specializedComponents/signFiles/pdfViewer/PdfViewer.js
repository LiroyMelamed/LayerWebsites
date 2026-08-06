import React, { useEffect, useMemo, useRef, useState } from "react";
import "../../../../utils/pdfjsConfig";
import { Document, Page } from "react-pdf";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";
import SimpleLoader from "../../../simpleComponents/SimpleLoader";
import SignatureSpotsLayer from "../signatureSpots/SignatureSpotsLayer";
import { useTranslation } from "react-i18next";

/** Spot coordinates are authored against this width; display may be wider. */
export const BASE_RENDER_WIDTH = 800;

function LazyPdfPage({
    pageNumber,
    renderWidth,
    spotScale,
    spots,
    onUpdateSpot,
    onRemoveSpot,
    onRequestRemove,
    onSelectSpot,
    onRequestContext,
    signers,
    selectedSpotIndex,
    selectedSpotId,
}) {
    const wrapRef = useRef(null);
    const [visible, setVisible] = useState(pageNumber <= 2);

    useEffect(() => {
        if (visible) return undefined;
        const el = wrapRef.current;
        if (!el) return undefined;
        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setVisible(true);
                    io.disconnect();
                }
            },
            { root: null, rootMargin: "900px 0px", threshold: 0.01 }
        );
        io.observe(el);
        return () => io.disconnect();
    }, [visible]);

    const placeholderHeight = Math.round(renderWidth * 1.35);

    return (
        <div ref={wrapRef} className="lw-signing-pageWrap">
            <SimpleContainer
                className="lw-signing-pageInner"
                data-page-number={pageNumber}
                style={{ width: renderWidth, maxWidth: "100%" }}
            >
                {visible ? (
                    <>
                        <SimpleContainer className="lw-signing-pdfPage">
                            <Page
                                pageNumber={pageNumber}
                                width={renderWidth}
                                renderTextLayer={false}
                                renderAnnotationLayer={false}
                            />
                        </SimpleContainer>
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
                            selectedSpotIndex={selectedSpotIndex}
                            selectedSpotId={selectedSpotId}
                        />
                    </>
                ) : (
                    <div
                        className="lw-signing-pagePlaceholder"
                        style={{ width: renderWidth, height: placeholderHeight }}
                        aria-hidden="true"
                    />
                )}
            </SimpleContainer>
        </div>
    );
}

/**
 * Single react-pdf Document for all pages — critical on iOS Safari.
 * Lazy-mounts off-screen pages for faster first paint.
 * Every page uses the same renderWidth so spotScale matches the canvas on all pages.
 */
export default function PdfViewer({
    pdfFile,
    pdfSource = null,
    spots = [],
    onUpdateSpot,
    onRemoveSpot,
    onRequestRemove,
    onSelectSpot,
    onRequestContext,
    onAddSpotForPage,
    signers = [],
    onPageChange,
    onDocumentReady,
    selectedSpotIndex = null,
    selectedSpotId = null,
    suppressLoadingUI = false,
}) {
    const { t } = useTranslation();
    const [numPages, setNumPages] = useState(0);
    const [objectUrl, setObjectUrl] = useState(null);

    const viewerRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(BASE_RENDER_WIDTH);

    useEffect(() => {
        if (pdfSource || !pdfFile) {
            setObjectUrl(null);
            return undefined;
        }
        const url = URL.createObjectURL(pdfFile);
        setObjectUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [pdfFile, pdfSource]);

    const file = pdfSource || objectUrl;

    useEffect(() => {
        const el = viewerRef.current;
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
    }, [numPages, file]);

    useEffect(() => {
        const container = viewerRef.current;
        if (!container || typeof onPageChange !== "function") return;

        const pages = Array.from(container.querySelectorAll("[data-page-number]"));
        if (!pages.length) {
            onPageChange(1);
            return;
        }

        let activePage = null;
        const ratios = new Map();

        const findScrollParent = (node) => {
            let cur = node;
            while (cur && cur !== document.body) {
                const style = window.getComputedStyle(cur);
                const overflowY = style?.overflowY;
                if ((overflowY === "auto" || overflowY === "scroll") && cur.scrollHeight > cur.clientHeight + 2) {
                    return cur;
                }
                cur = cur.parentElement;
            }
            return null;
        };

        const rootEl = findScrollParent(container);

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    const pageNumber = Number(entry.target.getAttribute("data-page-number")) || 1;
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
                root: rootEl || null,
                rootMargin: "-25% 0px -25% 0px",
                threshold: [0, 0.25, 0.5, 0.75, 1],
            }
        );

        pages.forEach((page) => observer.observe(page));
        return () => observer.disconnect();
    }, [onPageChange, numPages, file]);

    const renderWidth = useMemo(() => {
        const safe = Math.max(280, containerWidth || BASE_RENDER_WIDTH);
        return Math.floor(Math.min(safe - 16, 1400));
    }, [containerWidth]);

    const spotScale = useMemo(() => renderWidth / BASE_RENDER_WIDTH, [renderWidth]);

    useEffect(() => {
        setNumPages(0);
    }, [file]);

    if (!file) return null;

    const pagesToRender = numPages > 0 ? numPages : 0;

    return (
        <SimpleContainer
            className="lw-signing-pdfViewer"
            ref={viewerRef}
            style={{ ["--lw-pdf-render-width"]: `${renderWidth}px` }}
        >
            <Document
                file={file}
                loading={
                    suppressLoadingUI
                        ? null
                        : (
                            <SimpleContainer className="lw-signing-pdfLoading">
                                <SimpleLoader />
                            </SimpleContainer>
                        )
                }
                error={<div className="lw-signing-pdfLoading">{t("signing.pdf.loadError")}</div>}
                onLoadSuccess={(pdf) => {
                    setNumPages(pdf.numPages || 0);
                    if (typeof onDocumentReady === "function") onDocumentReady();
                }}
                onLoadError={(err) => {
                    console.error("PdfViewer Document load error:", err);
                    if (typeof onDocumentReady === "function") onDocumentReady();
                }}
            >
                {Array.from({ length: pagesToRender }).map((_, i) => {
                    const pageNumber = i + 1;
                    return (
                        <LazyPdfPage
                            key={pageNumber}
                            pageNumber={pageNumber}
                            renderWidth={renderWidth}
                            spotScale={spotScale}
                            spots={spots}
                            onUpdateSpot={onUpdateSpot}
                            onRemoveSpot={onRemoveSpot}
                            onRequestRemove={onRequestRemove}
                            onSelectSpot={onSelectSpot}
                            onRequestContext={onRequestContext}
                            signers={signers}
                            selectedSpotIndex={selectedSpotIndex}
                            selectedSpotId={selectedSpotId}
                        />
                    );
                })}
            </Document>
        </SimpleContainer>
    );
}
