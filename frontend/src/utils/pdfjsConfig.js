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

// Local worker matching installed pdfjs-dist (see scripts/copy-pdf-worker.js).
// Prefer .js over .mjs: some hosts serve .mjs as application/octet-stream, which
// breaks module workers in Safari ("Error loading PDF").
// Version query busts CDN/nginx 1y immutable cache when the unhashed worker updates.
pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL || ""}/pdf.worker.min.js?v=${pdfjs.version}`;
