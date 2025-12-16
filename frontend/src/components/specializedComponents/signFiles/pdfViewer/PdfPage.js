// src/components/specializedComponents/signFiles/pdfViewer/PdfPage.js
import React from "react";
import { Document, Page } from "react-pdf";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";

export default function PdfPage({
    pdfFile,
    pageNumber,
    onLoadTotalPages,
}) {
    return (
        <SimpleContainer style={{ position: "relative", width: "100%" }}>
            <Document
                file={pdfFile}
                onLoadSuccess={(pdf) => {
                    if (onLoadTotalPages) {
                        onLoadTotalPages(pdf.numPages);
                    }
                }}
                loading={<div>טוען PDF…</div>}
                error={<div>שגיאה בטעינת PDF</div>}
                options={{
                    // 👇 חשוב: מבטל worker לגמרי
                    worker: null,
                    disableWorker: true,
                }}
            >
                <Page
                    pageNumber={pageNumber}
                    width={800}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                />
            </Document>
        </SimpleContainer>
    );
}
