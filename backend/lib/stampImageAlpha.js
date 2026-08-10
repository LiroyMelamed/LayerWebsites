'use strict';

/**
 * Make near-white / background-colored pixels transparent so stamps/signatures
 * do not paint an opaque white rectangle over the PDF underneath.
 * Uses @napi-rs/canvas when available; otherwise returns the original buffer.
 */

let _canvasMod = null;
function getCanvas() {
    if (_canvasMod !== null) return _canvasMod;
    try {
        _canvasMod = require('@napi-rs/canvas');
    } catch {
        _canvasMod = false;
    }
    return _canvasMod;
}

/**
 * @param {Buffer} imgBuffer
 * @param {{ threshold?: number, feather?: number }} [opts]
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
async function ensureTransparentStampPng(imgBuffer, opts = {}) {
    const canvasApi = getCanvas();
    if (!canvasApi || !Buffer.isBuffer(imgBuffer) || !imgBuffer.length) {
        return { buffer: imgBuffer, contentType: 'image/png' };
    }

    const threshold = Number.isFinite(opts.threshold) ? opts.threshold : 48;
    const feather = Number.isFinite(opts.feather) ? opts.feather : 28;

    try {
        const { createCanvas, loadImage } = canvasApi;
        const img = await loadImage(imgBuffer);
        const w = Math.max(1, img.width | 0);
        const h = Math.max(1, img.height | 0);
        const canvas = createCanvas(w, h);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        const imageData = ctx.getImageData(0, 0, w, h);
        const d = imageData.data;

        // Sample corners for background color (typical scanned stamp letterbox).
        const corners = [
            0,
            (w - 1) * 4,
            ((h - 1) * w) * 4,
            ((h - 1) * w + (w - 1)) * 4,
        ];
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let n = 0;
        for (const idx of corners) {
            if (idx >= 0 && idx + 3 < d.length && d[idx + 3] > 8) {
                rSum += d[idx];
                gSum += d[idx + 1];
                bSum += d[idx + 2];
                n += 1;
            }
        }
        // Default to white letterbox if corners are empty/transparent.
        const bgR = n ? Math.round(rSum / n) : 255;
        const bgG = n ? Math.round(gSum / n) : 255;
        const bgB = n ? Math.round(bSum / n) : 255;

        // Also punch out near-white regardless of corner sample (JPEG washout).
        const whitePunch = 245;

        for (let i = 0; i < d.length; i += 4) {
            const r = d[i];
            const g = d[i + 1];
            const b = d[i + 2];
            const a = d[i + 3];
            if (a === 0) continue;

            const nearWhite = r >= whitePunch && g >= whitePunch && b >= whitePunch;
            const dr = r - bgR;
            const dg = g - bgG;
            const db = b - bgB;
            const dist = Math.sqrt(dr * dr + dg * dg + db * db);

            if (nearWhite || dist < threshold) {
                d[i + 3] = 0;
            } else if (dist < threshold + feather) {
                const t = (dist - threshold) / feather;
                d[i + 3] = Math.round(a * t);
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return { buffer: canvas.toBuffer('image/png'), contentType: 'image/png' };
    } catch (err) {
        console.warn('[stamp-alpha] transparency pass failed:', err.message);
        return { buffer: imgBuffer, contentType: 'image/png' };
    }
}

module.exports = { ensureTransparentStampPng };
