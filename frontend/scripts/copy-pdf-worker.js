/**
 * Keep public PDF.js worker in sync with the installed pdfjs-dist version.
 * react-pdf requires an exact match; a stale worker shows "Error loading PDF".
 *
 * We publish both .mjs and .js: some hosts serve .mjs as application/octet-stream,
 * which breaks module workers in Safari. .js is served as JavaScript reliably.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const destMjs = path.join(root, "public", "pdf.worker.min.mjs");
const destJs = path.join(root, "public", "pdf.worker.min.js");

if (!fs.existsSync(src)) {
    console.error(`[copy-pdf-worker] Missing worker at ${src}`);
    process.exit(1);
}

fs.copyFileSync(src, destMjs);
fs.copyFileSync(src, destJs);

const pkg = JSON.parse(fs.readFileSync(path.join(root, "node_modules", "pdfjs-dist", "package.json"), "utf8"));
console.log(`[copy-pdf-worker] Copied pdfjs-dist@${pkg.version} worker → public/pdf.worker.min.{mjs,js}`);
