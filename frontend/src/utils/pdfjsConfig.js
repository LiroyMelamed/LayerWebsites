import { pdfjs } from "react-pdf";

// URL.parse polyfill
if (!URL.parse) {
    URL.parse = function (url, base) {
        try {
            return new URL(url, base);
        } catch (error) {
            return null;
        }
    };
}

// workerSrc - must match runtime pdfjs version
pdfjs.GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
