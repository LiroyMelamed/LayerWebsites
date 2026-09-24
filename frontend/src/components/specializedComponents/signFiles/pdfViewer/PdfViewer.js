import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "../../../../utils/pdfjsConfig";
import { Document, Page } from "react-pdf";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";
import SimpleLoader from "../../../simpleComponents/SimpleLoader";
import SecondaryButton from "../../../styledComponents/buttons/SecondaryButton";
import SignatureSpotsLayer from "../signatureSpots/SignatureSpotsLayer";
import { useTranslation } from "react-i18next";
import { SPOT_BASE_WIDTH, spotSpaceScale } from "../../../../utils/signingSpotGeometry";
import "../signFiles.scss";

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

    // Publish measured canvas width for drag/resize/placement (dc093a2 coordinate system).
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
    const hasStableMeasure = measuredWidth >= 50;
    const displayWidth = hasStableMeasure ? measuredWidth : renderWidth;
    const overlayScale = (hasStableMeasure ? spotSpaceScale(measuredWidth) : 0)
        || (renderWidth / BASE_RENDER_WIDTH);

    return (
        <div ref={wrapRef} className="lw-signing-pageWrap">
            <SimpleContainer
                className="lw-signing-pageInner"
                data-page-number={pageNumber}
                data-measured-width={measuredWidth || undefined}
                style={{ width: displayWidth, maxWidth: "100%" }}
            >
                {visible ? (
                    <SimpleContainer className="lw-signing-pdfPage" ref={pageBoxRef}>
                        <Page
                            pageNumber={pageNumber}
                            width={renderWidth}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                            onRenderSuccess={() => setRenderToken((n) => n + 1)}
                        />
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
                            scale={overlayScale}
                            selectedSpotIndex={selectedSpotIndex}
                            selectedSpotId={selectedSpotId}
                        />
                    </SimpleContainer>
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
 * Layout width uses renderWidth; overlay scale uses measured canvas width
 * so spots stay aligned across screen sizes (dc093a2 coordinate system).
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
    const [retryCount, setRetryCount] = useState(0);

    const viewerRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(BASE_RENDER_WIDTH);

    const measureContainerWidth = useCallback(() => {
        const el = viewerRef.current;
        if (!el) return;

        const column = el.closest(".lw-signing-pdfViewerMain")
            || el.closest(".lw-signing-pdfViewerRow")
            || el;
        const w = column.clientWidth || column.getBoundingClientRect().width;
        if (w && Number.isFinite(w) && w >= 280) setContainerWidth(w);
    }, []);

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
    // A new document must not inherit page measurements or visibility from the old one.
    // Keep this stable when only signature spots or container dimensions change.
    const sourceKey = typeof file === "string" ? file : file?.url;

    const handleDocumentError = (err) => {
        console.error("PdfViewer Document load error:", err);
        if (typeof onDocumentReady === "function") onDocumentReady();
    };

    const retryDocument = () => {
        setNumPages(0);
        setPdfProxy(null);
        setRetryCount((count) => count + 1);
    };

    useLayoutEffect(() => {
        measureContainerWidth();
    }, [file, numPages, measureContainerWidth]);

    useEffect(() => {
        const el = viewerRef.current;
        if (!el) return;

        measureContainerWidth();

        let ro;
        if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(() => measureContainerWidth());
            for (const target of [
                el.closest(".lw-signing-pdfViewerMain"),
                el.closest(".lw-signing-pdfViewerRow"),
                el,
            ].filter(Boolean)) {
                ro.observe(target);
            }
        } else {
            window.addEventListener("resize", measureContainerWidth);
        }

        return () => {
            if (ro) ro.disconnect();
            else window.removeEventListener("resize", measureContainerWidth);
        };
    }, [numPages, file, measureContainerWidth]);

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
            style={{ "--lw-pdf-render-width": `${renderWidth}px` }}
        >
            <Document
                key={`${sourceKey}:${retryCount}`}
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
                error={
                    <div className="lw-signing-pdfLoading lw-signing-pdfLoadError" role="alert">
                        <span>{t("signing.pdf.loadError")}</span>
                        <SecondaryButton onPress={retryDocument}>
                            {t("common.retry")}
                        </SecondaryButton>
                    </div>
                }
                onLoadSuccess={(pdf) => {
                    setNumPages(pdf.numPages || 0);
                    setPdfProxy(pdf);
                    requestAnimationFrame(() => {
                        requestAnimationFrame(measureContainerWidth);
                    });
                    if (typeof onDocumentReady === "function") onDocumentReady();
                }}
                onLoadError={handleDocumentError}
                onSourceError={handleDocumentError}
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
