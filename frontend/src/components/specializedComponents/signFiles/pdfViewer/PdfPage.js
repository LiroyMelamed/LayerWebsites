import React, { useEffect, useState } from "react";
import "../../../../utils/pdfjsConfig";
import { Page } from "react-pdf";
import SimpleContainer from "../../../simpleComponents/SimpleContainer";

/** Renders one page inside a parent <Document>. Prefer PdfViewer for full documents. */
export default function PdfPage({ pageNumber = 1, renderWidth = 800 }) {
    return (
        <SimpleContainer className="lw-signing-pdfPage">
            <Page
                pageNumber={pageNumber}
                width={renderWidth}
                renderTextLayer={false}
                renderAnnotationLayer={false}
            />
        </SimpleContainer>
    );
}
