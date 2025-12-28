import React, { useEffect, useState } from "react";
import { Document, Page } from "react-pdf";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";

export default function PdfPage({ pdfFile, pageNumber = 1, onLoadTotalPages, renderWidth = 800 }) {
    const [objectUrl, setObjectUrl] = useState(null);

    useEffect(() => {
        if (!pdfFile) {
            setObjectUrl(null);
            return;
        }

        const url = URL.createObjectURL(pdfFile);
        setObjectUrl(url);

        return () => {
            URL.revokeObjectURL(url);
        };
    }, [pdfFile]);

    if (!objectUrl) return null;

    return (
        <SimpleContainer className="lw-signing-pdfPage">
            <Document
                file={objectUrl}
                loading={<div>טוען PDF…</div>}
                error={<div>שגיאה בטעינת PDF</div>}
                onLoadSuccess={(pdf) => {
                    if (onLoadTotalPages) onLoadTotalPages(pdf.numPages);
                }}
            >
                <Page
                    pageNumber={pageNumber}
                    width={renderWidth}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                />
            </Document>
        </SimpleContainer>
    );
}
