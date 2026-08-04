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

// Local worker (avoids CDN latency on first PDF open)
pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL || ""}/pdf.worker.min.mjs`;
