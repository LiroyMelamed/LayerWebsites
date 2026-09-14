import React, { useEffect, useMemo, useRef, useState } from "react";
import "../../../../utils/pdfjsConfig";
import { Document, Page } from "react-pdf";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";
import SimpleLoader from "../../../simpleComponents/SimpleLoader";
import SignatureSpotsLayer from "../signatureSpots/SignatureSpotsLayer";
import { useTranslation } from "react-i18next";
import { SPOT_BASE_WIDTH, spotSpaceScale } from "../../../../utils/signingSpotGeometry";

/** Spot coordinates are authored against this width; display may be wider. */
export const BASE_RENDER_WIDTH = SPOT_BASE_WIDTH;

/** A4 ratio, used only until a page's real dimensions are known. */
const FALLBACK_PAGE_ASPECT = 841.89 / 595.276;

function LazyPdfPage({
    pageNumber,
    renderWidth,
    pdfProxy,
    spots,
    onUpdateSpot,
    onRemoveSpot,
    onRequestRemove,
    onSelectSpot,
    onEditSpot,
    onRequestContext,
    signers,
    selectedSpotIndex,
    selectedSpotId,
}) {
    const wrapRef = useRef(null);
    const pageBoxRef = useRef(null);
    const [visible, setVisible] = useState(pageNumber <= 2);
    const [measuredWidth, setMeasuredWidth] = useState(0);
    const [renderToken, setRenderToken] = useState(0);
    const [pageAspect, setPageAspect] = useState(0);

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

    /**
     * Measure the canvas that was actually drawn, never the width we asked for.
     * Spot coordinates are persisted against this measurement, so an assumed
     * width here silently rescales every spot on the page.
     */
    useEffect(() => {
        if (!visible) return undefined;
        const host = pageBoxRef.current;
        if (!host) return undefined;

        const measure = () => {
            const canvas = host.querySelector("canvas");
            if (!canvas) return;
            const w = canvas.getBoundingClientRect().width;
            if (w > 0) {
                setMeasuredWidth((prev) => (Math.abs(prev - w) < 0.01 ? prev : w));
            }
        };

        measure();

        let ro;
        if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(() => measure());
            ro.observe(host);
            const canvas = host.querySelector("canvas");
            if (canvas) ro.observe(canvas);
        }
        return () => ro?.disconnect();
    }, [visible, renderWidth, renderToken]);

    // Real page aspect ratio, so the lazy placeholder reserves the correct
    // height and page hit-testing is not thrown off by a guessed one.
    useEffect(() => {
        if (!pdfProxy || pageAspect > 0) return undefined;
        let cancelled = false;
        pdfProxy
            .getPage(pageNumber)
            .then((page) => {
                if (cancelled) return;
                const viewport = page.getViewport({ scale: 1 });
                if (viewport?.width > 0) setPageAspect(viewport.height / viewport.width);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [pdfProxy, pageNumber, pageAspect]);

    const placeholderHeight = Math.round(renderWidth * (pageAspect || FALLBACK_PAGE_ASPECT));
    const spotScale = spotSpaceScale(measuredWidth);

    return (
        <div ref={wrapRef} className="lw-signing-pageWrap">
            <SimpleContainer
                className="lw-signing-pageInner"
                data-page-number={pageNumber}
                data-measured-width={measuredWidth || undefined}
            >
                {visible ? (
                    <>
                        <SimpleContainer className="lw-signing-pdfPage" ref={pageBoxRef}>
                            <Page
                                pageNumber={pageNumber}
                                width={renderWidth}
                                renderTextLayer={false}
                                renderAnnotationLayer={false}
                                onRenderSuccess={() => setRenderToken((n) => n + 1)}
                            />
                        </SimpleContainer>
                        {spotScale > 0 ? (
                            <SignatureSpotsLayer
                                pageNumber={pageNumber}
                                spots={spots}
                                onUpdateSpot={onUpdateSpot}
                                onRemoveSpot={onRemoveSpot}
                                onRequestRemove={onRequestRemove}
                                onSelectSpot={onSelectSpot}
                                onEditSpot={onEditSpot}
                                onRequestContext={onRequestContext}
                                signers={signers}
                                scale={spotScale}
                                selectedSpotIndex={selectedSpotIndex}
                                selectedSpotId={selectedSpotId}
                            />
                        ) : null}
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
 * renderWidth is only a request; each page derives its own spot scale from the
 * canvas it actually rendered, so a clamped or rounded page cannot persist spots
 * against a scale the page was not drawn at.
 */
export default function PdfViewer({
    pdfFile,
    pdfSource = null,
    spots = [],
    onUpdateSpot,
    onRemoveSpot,
    onRequestRemove,
    onSelectSpot,
    onEditSpot,
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
    const [pdfProxy, setPdfProxy] = useState(null);

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

    useEffect(() => {
        setNumPages(0);
        setPdfProxy(null);
    }, [file]);

    if (!file) return null;

    const pagesToRender = numPages > 0 ? numPages : 0;

    return (
        <SimpleContainer
            className="lw-signing-pdfViewer"
            ref={viewerRef}
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
                    setPdfProxy(pdf);
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
                            pdfProxy={pdfProxy}
                            spots={spots}
                            onUpdateSpot={onUpdateSpot}
                            onRemoveSpot={onRemoveSpot}
                            onRequestRemove={onRequestRemove}
                            onSelectSpot={onSelectSpot}
                            onEditSpot={onEditSpot}
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
