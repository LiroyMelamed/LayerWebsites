import React from "react";
import { Document, Page, pdfjs } from "react-pdf";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";

// 👇 CRA-compatible worker setup
pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.js`;

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
