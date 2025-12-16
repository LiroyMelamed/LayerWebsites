import React from "react";
import { Document, Page } from "react-pdf";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";

export default function PdfPage({
    pdfFile,
    onLoadTotalPages,
}) {

    console.log('pdfFile in PdfPage:', pdfFile);

    return (
        <SimpleContainer style={{ position: "relative", width: "100%" }}>
            <Document
                file={pdfFile}
                loading={<div>טוען PDF…</div>}
                error={<div>שגיאה בטעינת PDF</div>}
                onLoadSuccess={(pdf) => {
                    if (onLoadTotalPages) {
                        onLoadTotalPages(pdf.numPages);
                    }
                }}
                options={{
                    worker: null,
                    disableWorker: true,
                }}
            >
                <Page
                    width={800}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                />
            </Document>
        </SimpleContainer>
    );
}
