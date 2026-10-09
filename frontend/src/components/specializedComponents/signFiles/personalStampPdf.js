// Package drawings are PNG images. Render a single-page stamp with the same
// PDF.js worker as the document viewer; never silently discard extra pages.
export async function personalStampPdf(file, pdfjs) {
    if (file.size > 5 * 1024 * 1024) throw new Error('STAMP_PDF_TOO_LARGE');
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
    try {
        const pdf = await task.promise;
        if (pdf.numPages !== 1) throw new Error('STAMP_PDF_ONE_PAGE');
        const page = await pdf.getPage(1);
        const bounds = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(2, 1200 / Math.max(bounds.width, bounds.height)) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(20, Math.ceil(viewport.width));
        canvas.height = Math.max(10, Math.ceil(viewport.height));
        const canvasContext = canvas.getContext('2d');
        if (!canvasContext) throw new Error('STAMP_CANVAS_UNAVAILABLE');
        await page.render({ canvasContext, viewport }).promise;
        const image = canvas.toDataURL('image/png');
        if (Math.ceil((image.split(',')[1]?.length || 0) * 3 / 4) > 300 * 1024) throw new Error('STAMP_PDF_TOO_LARGE');
        return image;
    } finally {
        await task.destroy();
    }
}
