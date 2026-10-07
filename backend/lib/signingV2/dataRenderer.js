const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, pushGraphicsState, popGraphicsState, concatTransformationMatrix } = require('pdf-lib');
const { pageGeometryFromPdfLibPage, visualDrawingFrame } = require('../signingGeometry');
const { bytesHash, digest } = require('./canonical');
const { expect, fail } = require('./errors');
const limits = require('./limits');

const RENDERER_VERSION = 'signing-data-v2.3';
const FONTS_DIR = path.join(__dirname, '../../assets/fonts');
// Neither Noto file has Latin letters; without this font, English values would use whatever the host has installed.
const LATIN_DIR = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts');
const FONT_FILES = [
    ['SigningArabic', FONTS_DIR, 'NotoSansArabic-Regular.ttf'],
    ['SigningHebrew', FONTS_DIR, 'NotoSansHebrew-Regular.ttf'],
    ['SigningLatin', LATIN_DIR, 'LiberationSans-Regular.ttf'],
];
const FONT_STACK = FONT_FILES.map(([family]) => family).join(',');
let assets;
function rendererAssets() {
    if (!assets) {
        const fonts = FONT_FILES.map(([family, dir, file]) => {
            const bytes = fs.readFileSync(path.join(dir, file));
            return { family, hash: bytesHash(bytes), uri: `data:font/ttf;base64,${bytes.toString('base64')}` };
        });
        assets = Object.freeze({ fonts, version: RENDERER_VERSION,
            hash: digest({ renderer: RENDERER_VERSION, fonts: fonts.map(font => ({ family: font.family, hash: font.hash })) }) });
    }
    return assets;
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function displayValue(value, locale) {
    if (value === true) return { he: 'כן', ar: 'نعم', en: 'Yes' }[locale];
    if (value === false) return { he: 'לא', ar: 'لا', en: 'No' }[locale];
    return value === null ? '' : String(value);
}

function overlayHtml(pages, fields, locale, fonts) {
    const cssPages = pages.map((geometry, index) => `@page p${index}{size:${geometry.visualWidth / geometry.scale}pt ${geometry.visualHeight / geometry.scale}pt;margin:0}
        .p${index}{page:p${index};width:${geometry.visualWidth / geometry.scale}pt;height:${geometry.visualHeight / geometry.scale}pt}`).join('\n');
    const body = pages.map((geometry, index) => {
        const content = fields.filter(field => field.pageNum === index + 1).map(field => {
            const style = `left:${field.x / geometry.scale}pt;top:${field.y / geometry.scale}pt;width:${field.width / geometry.scale}pt;height:${field.height / geometry.scale}pt;font-size:${field.fontSize / geometry.scale}pt;text-align:${field.align || 'start'};white-space:${field.multiline ? 'pre-wrap' : 'pre'}`;
            return `<div class="value" data-field="${escapeHtml(field.id)}" dir="auto" style="${style}"><span>${escapeHtml(displayValue(field.value, locale))}</span></div>`;
        }).join('');
        return `<section class="sheet p${index}">${content}</section>`;
    }).join('');
    return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><style>
        ${fonts.map(font => `@font-face{font-family:${font.family};src:url('${font.uri}') format('truetype');font-weight:400}`).join('\n')}
        ${cssPages}
        *{box-sizing:border-box}html,body{margin:0;padding:0;background:transparent}
        .sheet{position:relative;break-after:page;overflow:hidden}.sheet:last-child{break-after:auto}
        .value{position:absolute;font-family:${FONT_STACK};line-height:normal;color:#000;font-weight:400;overflow:visible;overflow-wrap:normal}
        </style></head><body>${body}</body></html>`;
}

async function loadFonts() {
    await Promise.all([document.fonts.load('14px SigningArabic', 'العربية'), document.fonts.load('14px SigningHebrew', 'עברית'),
        document.fonts.load('14px SigningLatin', 'Latin')]);
    await document.fonts.ready;
}

// Pages may only load inline data; nothing in a signing document can reach the network.
async function isolatedPage(context) {
    const page = await context.newPage();
    await page.setRequestInterception(true);
    page.on('request', request => {
        if (request.url().startsWith('data:') || request.url() === 'about:blank') request.continue();
        else request.abort('blockedbyclient');
    });
    await page.setJavaScriptEnabled(false);
    return page;
}

async function createDataRenderer({ executablePath, noSandbox = false } = {}) {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ ...(executablePath ? { executablePath } : {}),
        ...(noSandbox ? { args: ['--no-sandbox', '--disable-setuid-sandbox'] } : {}) });
    const fontAssets = rendererAssets();
    // One renderer belongs to one worker. It never handles two packages at once.
    let active = false;
    return {
        assets: fontAssets,
        browserProcess: browser.process(),
        close: () => browser.close(),
        async render({ sourceBytes, expectedSourceHash, fields, locale }) {
            expect(!active, 'RENDERER_BUSY');
            expect(['he', 'ar', 'en'].includes(locale), 'INVALID_LOCALE');
            expect(Buffer.isBuffer(sourceBytes) && sourceBytes.length <= limits.sourceBytesPerDocument && bytesHash(sourceBytes) === expectedSourceHash, 'SOURCE_CHANGED');
            active = true;
            let page;
            try {
                // pdf-lib documents and all business values are fresh per job.
                const pdf = await PDFDocument.load(sourceBytes, { updateMetadata: false });
                expect(pdf.getPageCount() > 0 && pdf.getPageCount() <= limits.sourcePagesPerDocument, 'INVALID_SOURCE');
                const geometries = pdf.getPages().map(sourcePage => pageGeometryFromPdfLibPage(sourcePage));
                const dataFields = fields.filter(field => field.type === 'data' && field.value !== null);
                for (const field of dataFields) {
                    const geometry = geometries[field.pageNum - 1];
                    expect(geometry && field.overflow === 'block' && field.x >= 0 && field.y >= 0
                        && field.x + field.width <= 800 && field.y + field.height <= geometry.visualHeight,
                    'INVALID_GEOMETRY', field.id);
                }
                if (!dataFields.length) return { bytes: Buffer.from(sourceBytes), contentHash: expectedSourceHash,
                    rendererHash: fontAssets.hash, geometry: geometries.map(item => ({ width: item.visualWidth, height: item.visualHeight })), overflow: [] };
                const html = overlayHtml(geometries, dataFields, locale, fontAssets.fonts);
                const context = await browser.createBrowserContext();
                try {
                    page = await isolatedPage(context);
                    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    await page.evaluate(loadFonts);
                    const measurement = await page.evaluate(() => ({
                        fontsReady: Array.from(document.fonts).every(font => font.status === 'loaded'),
                        overflow: Array.from(document.querySelectorAll('.value')).filter(element => {
                            const range = document.createRange(); range.selectNodeContents(element);
                            const bounds = element.getBoundingClientRect();
                            const text = range.getBoundingClientRect();
                            const tolerance = 0.25;
                            return element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1
                                || text.left < bounds.left - tolerance || text.right > bounds.right + tolerance
                                || text.top < bounds.top - tolerance || text.bottom > bounds.bottom + tolerance;
                        }).map(element => element.dataset.field),
                    }));
                    expect(measurement.fontsReady, 'FONT_LOAD_FAILED');
                    if (measurement.overflow.length) fail('TEXT_OVERFLOW', 422, measurement.overflow.map(id => ({ path: id, code: 'TEXT_OVERFLOW' })));
                    const overlayBytes = await page.pdf({ preferCSSPageSize: true, printBackground: false, omitBackground: true,
                        displayHeaderFooter: false, timeout: 15000 });
                    const overlay = await PDFDocument.load(overlayBytes);
                    expect(overlay.getPageCount() === pdf.getPageCount(), 'RENDER_PAGE_MISMATCH');
                    const embedded = await pdf.embedPages(overlay.getPages());
                    pdf.getPages().forEach((sourcePage, index) => {
                        const geometry = geometries[index];
                        const frame = visualDrawingFrame(geometry, { x: 0, y: 0, width: 800, height: geometry.visualHeight });
                        expect(Math.abs(embedded[index].width - frame.width) <= 0.5 && Math.abs(embedded[index].height - frame.height) <= 0.5, 'RENDER_PAGE_MISMATCH');
                        sourcePage.pushOperators(pushGraphicsState(), concatTransformationMatrix(...frame.transform));
                        // Chromium rounds paper dimensions to device pixels. Keep
                        // glyph coordinates at 1:1 scale and align the top edge;
                        // stretching the page would move distant signature fields.
                        sourcePage.drawPage(embedded[index], { x: 0, y: frame.height - embedded[index].height });
                        sourcePage.pushOperators(popGraphicsState());
                    });
                    const bytes = Buffer.from(await pdf.save({ useObjectStreams: true }));
                    return { bytes, contentHash: bytesHash(bytes), rendererHash: fontAssets.hash,
                        geometry: geometries.map(item => ({ width: item.visualWidth, height: item.visualHeight })), overflow: [] };
                } finally {
                    await context.close();
                }
            } finally {
                active = false;
            }
        },
        // Self-contained documents such as the evidence certificate. Fonts come from the same bundled set.
        async renderHtml({ html }) {
            expect(!active, 'RENDERER_BUSY');
            expect(typeof html === 'string' && html.length > 0 && html.length <= 4 * 1024 * 1024, 'INVALID_DOCUMENT');
            active = true;
            const context = await browser.createBrowserContext();
            try {
                const page = await isolatedPage(context);
                await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
                await page.evaluate(loadFonts);
                expect(await page.evaluate(() => Array.from(document.fonts).every(font => font.status === 'loaded')), 'FONT_LOAD_FAILED');
                const bytes = Buffer.from(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, timeout: 15000 }));
                return { bytes, contentHash: bytesHash(bytes), rendererHash: fontAssets.hash };
            } finally {
                await context.close();
                active = false;
            }
        },
    };
}

module.exports = { createDataRenderer, rendererAssets, overlayHtml, RENDERER_VERSION, FONT_STACK };
