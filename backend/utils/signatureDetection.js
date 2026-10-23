'use strict';

const fs = require('fs');
const path = require('path');
const {
    BASE_RENDER_WIDTH: FRONTEND_PAGE_RENDER_WIDTH,
    pageGeometryFromPdfjsPage,
    pdfBoxToVisualBox,
} = require('../lib/signingGeometry');

// These are discovery limits, not signing/upload limits. Fail rather than return
// an apparently complete result when the whole document could not be inspected.
const MAX_PAGES = 200;
const MAX_ITEMS_PER_PAGE = 50000;
const MAX_OPERATORS_PER_PAGE = 250000;
const MAX_SIGNERS = 200;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MIN_LINE_WIDTH = 30;
const MAX_LINE_WIDTH = 320;
const DEFAULT_SPOT_HEIGHT = 50;
const MIN_SPOT_HEIGHT = 16;
const SIGNATURE_ROW_GAP = 4;
const MIN_SPOT_WIDTH = 120;
const MAX_SPOT_WIDTH = 260;

function detectionError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function normalizeText(text) {
    return String(text || '').normalize('NFKC').toLowerCase()
        .replace(/[\u0591-\u05bd\u05bf-\u05c7\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/gu, '')
        .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function validateSigners(signers) {
    if (signers == null) return [];
    if (!Array.isArray(signers) || signers.length > MAX_SIGNERS) {
        throw detectionError('INVALID_SIGNERS', 'Signers must be an array of at most 200 people');
    }
    return signers.map((signer, index) => {
        if (typeof signer !== 'string' && (!signer || typeof signer !== 'object' || Array.isArray(signer))) {
            throw detectionError('INVALID_SIGNERS', 'Each signer must have a valid name');
        }
        const name = typeof signer === 'string' ? signer : signer.name ?? signer.Name;
        const userId = typeof signer === 'string' ? null : signer.userId ?? signer.UserId ?? signer.id ?? null;
        if (typeof name !== 'string' || name.length > 200 || !normalizeText(name)
            || (userId != null && !((typeof userId === 'string' && userId.length <= 128 && userId.length > 0)
                || (Number.isSafeInteger(userId) && userId > 0)))) {
            throw detectionError('INVALID_SIGNERS', 'Each signer must have a bounded name and valid optional ID');
        }
        return { index, name: name.trim(), userId, normalized: normalizeText(name) };
    });
}

// Explicit signature labels only. Name, date, ID, party names and generic form
// blanks are deliberately not signature cues.
function isSignatureCue(text) {
    // Some embedded Arabic fonts map the lam glyph to U+029C in ToUnicode.
    // Accept only this complete signature-label token, never repair person names.
    const t = normalizeText(text).replace(/(?:^| )اʜتوقيع(?= |$)/gu, ' التوقيع').trim();
    if (!t || t.length > 80 || t.split(' ').length > 10) return false;
    if (/(?:no signature|not required|without signature|do not sign|ללא חתימה|אין צורך|بدون توقيع|لا يلزم)/u.test(t)) return false;
    if (/(?:^| )(?:confirm|confirms|acknowledge|acknowledges|agree|agrees|מאשר|מאשרת|מסכים|يقر|يوافق)(?: |$)/u.test(t)) return false;
    return /(?:^| )(?:חתימה|חתימת|חתום כאן|חתמו כאן|signature|sign here|signed by|توقيع|التوقيع|امضاء|إمضاء)(?: |$)/u.test(t);
}
function isOtherFieldCue(text) {
    return /(?:^| )(?:תאריך|שם|ת ז|ח פ|date|name|id|phone|email|اسم|الاسم|تاريخ|التاريخ|هوية)(?: |$)/u.test(normalizeText(text))
        && !isSignatureCue(text);
}

function resolvePdfjsStandardFontDataUrl() {
    // Do not let detection fetch a font URL: PDF parsing stays entirely local.
    const root = path.dirname(require.resolve('pdfjs-dist/package.json'));
    return path.join(root, 'standard_fonts') + path.sep;
}

function normalizeTextItem(item) {
    if (!item || typeof item.str !== 'string' || !item.str.trim()) return null;
    const t = item.transform || [];
    const x = Number(t[4]), y = Number(t[5]);
    const width = Math.abs(Number(item.width)), height = Math.hypot(Number(t[2]) || 0, Number(t[3]) || 0) || 10;
    if (![x, y, width, height].every(Number.isFinite)) return null;
    // Text rotated inside the page requires a different baseline model. Page
    // /Rotate itself is supported by the canonical geometry conversion below.
    if (Math.abs(Number(t[1]) || 0) > Math.abs(Number(t[0]) || 0) * 0.1) return null;
    return { str: item.str, x, y, width, height, dir: item.dir };
}

function splitTextUnderlines(items) {
    const labels = [], lines = [];
    for (const item of items) {
        const onlyLine = /^[\s_\-\u2013\u2014\u2015]+$/u.test(item.str);
        const matches = [...item.str.matchAll(onlyLine ? /[_\-\u2013\u2014\u2015]+/gu : /[_\-\u2013\u2014\u2015]{3,}/gu)];
        if (!matches.length) { labels.push(item); continue; }
        // Mixed label/underline extraction is common in Word PDFs. Keep each
        // span's own x range instead of assigning the entire row one anchor.
        const rtl = item.dir === 'rtl' || /[\u0590-\u08ff]/u.test(item.str);
        let cursor = 0;
        const addPart = (str, start, length, line) => {
            if (!str.trim()) return;
            const fraction = length / item.str.length;
            const offset = rtl ? 1 - (start + length) / item.str.length : start / item.str.length;
            const part = { ...item, str, x: item.x + item.width * offset, width: item.width * fraction };
            if (line) lines.push({ ...part, source: 'text-underline', mixed: item.str.trim() !== str });
            else labels.push(part);
        };
        for (const match of matches) {
            addPart(item.str.slice(cursor, match.index), cursor, match.index - cursor, false);
            addPart(match[0], match.index, match[0].length, true);
            cursor = match.index + match[0].length;
        }
        addPart(item.str.slice(cursor), cursor, item.str.length - cursor, false);
    }
    return { labels, lines };
}

function mergeLines(lines) {
    const merged = [];
    for (const line of lines.slice().sort((a, b) => a.y - b.y || a.x - b.x)) {
        const prev = merged.find(other => Math.abs(other.y - line.y) <= 2
            && line.x <= other.x + other.width + 6 && line.x + line.width >= other.x - 6);
        if (prev) {
            const end = Math.max(prev.x + prev.width, line.x + line.width);
            prev.x = Math.min(prev.x, line.x); prev.width = end - prev.x;
            prev.mixed = prev.mixed || line.mixed;
        } else merged.push({ ...line });
    }
    return merged.filter(line => line.width >= MIN_LINE_WIDTH && line.width <= MAX_LINE_WIDTH);
}

function textGroups(items) {
    const rows = [];
    for (const item of items.slice().sort((a, b) => a.y - b.y || a.x - b.x)) {
        const previous = rows[rows.length - 1];
        const row = previous && Math.abs(previous.y - item.y) <= Math.max(2, Math.min(4, item.height * 0.25)) ? previous : null;
        if (row) row.items.push(item); else rows.push({ y: item.y, items: [item] });
    }
    const groups = [];
    for (const row of rows) {
        let run = [];
        const finish = () => {
            if (!run.length) return;
            const x = run[0].x, end = Math.max(...run.map(item => item.x + item.width));
            const variants = new Set();
            for (const ordered of [run, run.slice().reverse()]) {
                variants.add(ordered.map(item => item.str).join(' '));
                // Join only touching fragments, so split letters work without
                // collapsing physically separated names into one page-wide label.
                variants.add(ordered.map((item, i) => {
                    if (!i) return item.str;
                    const prev = ordered[i - 1];
                    const gap = Math.max(item.x, prev.x) - Math.min(item.x + item.width, prev.x + prev.width);
                    return (gap <= 2 ? '' : ' ') + item.str;
                }).join(''));
            }
            groups.push({ x, y: row.y, width: end - x, height: Math.max(...run.map(item => item.height)), variants: [...variants], str: run.map(item => item.str).join(' ') });
            run = [];
        };
        for (const item of row.items.sort((a, b) => a.x - b.x)) {
            const prev = run[run.length - 1];
            if (prev && item.x - (prev.x + prev.width) > Math.max(14, Math.min(24, item.height * 1.5))) finish();
            run.push(item);
        }
        finish();
    }
    return groups;
}

function horizontalGap(a, b) {
    return Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
}
function localDistance(line, label) {
    const dy = Math.abs(line.y - label.y), gap = horizontalGap(line, label);
    if (dy <= Math.max(3, label.height * 0.3)) return gap <= 100 ? gap + dy * 3 : Infinity;
    const centre = line.x + line.width / 2;
    const aligned = gap === 0 || (centre >= label.x - 30 && centre <= label.x + label.width + 30);
    return dy <= 48 && aligned ? dy * 3 + gap + Math.abs(centre - (label.x + label.width / 2)) * 0.1 : Infinity;
}

// Only painted, straight, thin horizontal segments count. CTM/save/restore and
// form transforms are tracked; rectangle borders/curves/filled shapes are not
// assumed to be a signature line. An explicit nearby label is still required.
function vectorUnderlines(list, pdfjs) {
    const { OPS, Util } = pdfjs;
    if (list.fnArray.length > MAX_OPERATORS_PER_PAGE) throw detectionError('DETECTION_LIMIT', 'PDF page is too complex for automatic detection');
    let matrix = [1, 0, 0, 1, 0, 0], pending = [], width = 1;
    const stack = [], lines = [];
    const save = () => stack.push({ matrix: matrix.slice(), width });
    const restore = () => { const value = stack.pop(); if (value) ({ matrix, width } = value); };
    for (let i = 0; i < list.fnArray.length; i++) {
        const op = list.fnArray[i], args = list.argsArray[i] || [];
        if (op === OPS.save) save();
        else if (op === OPS.restore) restore();
        else if (op === OPS.transform) matrix = Util.transform(matrix, args);
        else if (op === OPS.setLineWidth) width = Number(args[0]) || 1;
        else if (op === OPS.paintFormXObjectBegin) { save(); if (args[0]) matrix = Util.transform(matrix, args[0]); }
        else if (op === OPS.paintFormXObjectEnd) restore();
        else if (op === OPS.constructPath) {
            const [ops, values] = args;
            let j = 0, point = null, subpathStart = pending.length;
            for (const part of ops) {
                if (part === OPS.moveTo) { point = [values[j++], values[j++]]; subpathStart = pending.length; }
                else if (part === OPS.lineTo) {
                    const next = [values[j++], values[j++]];
                    if (point) {
                        const a = Util.applyTransform(point, matrix), b = Util.applyTransform(next, matrix);
                        const lineWidth = width * Math.max(Math.hypot(matrix[0], matrix[1]), Math.hypot(matrix[2], matrix[3]));
                        if (Math.abs(a[1] - b[1]) <= 1 && lineWidth <= 2) pending.push({ x: Math.min(a[0], b[0]), y: (a[1] + b[1]) / 2, width: Math.abs(a[0] - b[0]), source: 'vector-underline' });
                    }
                    point = next;
                } else if (part === OPS.rectangle) { j += 4; point = null; }
                else if (part === OPS.curveTo) { j += 6; point = null; }
                else if (part === OPS.curveTo2 || part === OPS.curveTo3) { j += 4; point = null; }
                else if (part === OPS.closePath) { pending.splice(subpathStart); point = null; }
                else { point = null; }
            }
        } else if (op === OPS.stroke || op === OPS.closeStroke || op === OPS.fillStroke || op === OPS.eoFillStroke || op === OPS.closeFillStroke || op === OPS.closeEOFillStroke) {
            lines.push(...pending); pending = [];
        } else if (op === OPS.endPath || op === OPS.fill || op === OPS.eoFill) pending = [];
    }
    return lines;
}

function candidateSpots(labels, lines, geometry, pageNum) {
    const grouped = textGroups(labels);
    const cues = grouped.filter(label => label.variants.some(isSignatureCue));
    const others = grouped.filter(label => label.variants.some(isOtherFieldCue));
    const proposals = [];
    const usedCues = new Set();
    for (const line of mergeLines(lines)) {
        const options = cues.map((cue, index) => ({ cue, index, distance: localDistance(line, cue) }))
            .filter(option => Number.isFinite(option.distance) && !usedCues.has(option.index)).sort((a, b) => a.distance - b.distance);
        if (!options.length) continue;
        const best = options[0];
        if (others.some(label => localDistance(line, label) + 5 < best.distance)) continue;
        // Two equally close labels need a person's decision, not an invented box.
        if (options[1] && Math.abs(options[1].distance - best.distance) < 4) continue;
        usedCues.add(best.index);
        const width = Math.min(Math.max(line.width, MIN_SPOT_WIDTH), MAX_SPOT_WIDTH);
        proposals.push({ line, cue: best.cue, x: line.x + line.width / 2 - width / 2, width });
    }
    const spots = [];
    let crampedSignatureCount = 0;
    for (const proposal of proposals) {
        const { line, cue, x, width } = proposal;
        const overlapsColumn = other => Math.min(x + width, other.x + other.width) - Math.max(x, other.x) > 2;
        // PDF y grows upward. Keep the bottom on the detected line, and bound
        // only this column's free space before canonical rotation/crop mapping.
        // Separate columns must not shrink one another's signature areas.
        let height = Math.min(DEFAULT_SPOT_HEIGHT, geometry.viewBox[3] - line.y);
        for (const other of proposals) {
            if (other !== proposal && other.line.y > line.y + 2 && overlapsColumn(other)) {
                height = Math.min(height, other.line.y - line.y - SIGNATURE_ROW_GAP);
            }
        }
        for (const label of grouped) {
            if (label.y > line.y + 2 && overlapsColumn(label)) {
                // Text extraction reports the baseline, not a glyph outline.
                // Reserve a bounded descender allowance and a small gap; this
                // is conservative discovery geometry, still requiring review.
                const clearance = Math.max(SIGNATURE_ROW_GAP, label.height * 0.25 + 2);
                height = Math.min(height, label.y - line.y - clearance);
            }
        }
        if (height < MIN_SPOT_HEIGHT) { crampedSignatureCount++; continue; }
        const pdfBox = { x, y: line.y, width, height };
        const ui = pdfBoxToVisualBox(geometry, pdfBox);
        const visualWidth = Math.min(Math.round(ui.width), geometry.visualWidth);
        const visualHeight = Math.min(Math.round(ui.height), geometry.visualHeight);
        spots.push({
            pageNum,
            x: Math.max(0, Math.min(Math.round(ui.x), geometry.visualWidth - visualWidth)),
            y: Math.max(0, Math.min(Math.round(ui.y), geometry.visualHeight - visualHeight)),
            width: visualWidth, height: visualHeight,
            pdfX: pdfBox.x, pdfY: pdfBox.y, pdfWidth: width, pdfHeight: height,
            pdfAnchorX: line.x + line.width / 2, pdfAnchorY: line.y,
            signerName: cue.variants.find(isSignatureCue).trim().slice(0, 80),
            isRequired: true, confidence: line.mixed ? 0.75 : 0.9, source: line.source,
            assignmentStatus: 'unassigned',
        });
    }
    return { spots, crampedSignatureCount };
}

function hasPhrase(text, phrase) {
    return (` ${normalizeText(text)} `).includes(` ${phrase} `);
}
function assignSignersToSpots(spots, signers, pageItems = []) {
    const people = validateSigners(signers);
    const groupsByPage = new Map(), itemsByPage = new Map();
    for (const item of pageItems) {
        if (!itemsByPage.has(item.pageNum)) itemsByPage.set(item.pageNum, []);
        itemsByPage.get(item.pageNum).push(item);
    }
    for (const [pageNum, items] of itemsByPage) groupsByPage.set(pageNum, textGroups(items));
    return spots.map(spot => {
        const clean = { ...spot, assignmentStatus: 'unassigned' };
        delete clean.signerIndex; delete clean.signerUserId;
        if (!people.length) return clean;
        const line = {
            x: Number.isFinite(spot.pdfX) ? spot.pdfX : spot.x,
            y: Number.isFinite(spot.pdfAnchorY) ? spot.pdfAnchorY : spot.y,
            width: Number.isFinite(spot.pdfWidth) ? spot.pdfWidth : spot.width,
        };
        const matches = [];
        for (const group of groupsByPage.get(spot.pageNum) || []) {
            // A signer label is local both vertically and horizontally. Do not
            // steal a name from a neighbouring column on the same baseline.
            const dy = Math.abs(group.y - line.y), gap = horizontalGap(line, group);
            if (dy > 45 || gap > (dy <= 4 ? 75 : 25)) continue;
            for (const person of people) {
                if (group.variants.some(text => hasPhrase(text, person.normalized))) {
                    matches.push({ person, score: dy * 3 + gap });
                }
            }
        }
        const bestByPerson = new Map();
        for (const match of matches) {
            const previous = bestByPerson.get(match.person.index);
            if (!previous || previous.score > match.score) bestByPerson.set(match.person.index, match);
        }
        // Duplicate names or more than one locally plausible signer are left
        // unassigned. There is intentionally no order/round-robin fallback.
        if (bestByPerson.size !== 1) return clean;
        const { person } = [...bestByPerson.values()][0];
        return { ...clean, assignmentStatus: 'matched', signerIndex: person.index, signerName: person.name,
            ...(person.userId != null ? { signerUserId: person.userId } : {}) };
    });
}

async function detectSignatureSpotsDetailed(buffer, signers = null) {
    validateSigners(signers);
    if (!buffer || !buffer.length || buffer.length > MAX_FILE_BYTES) throw detectionError('INVALID_PDF', 'Invalid or oversized PDF buffer');
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({ data: new Uint8Array(buffer), standardFontDataUrl: resolvePdfjsStandardFontDataUrl(), isEvalSupported: false, stopAtErrors: true });
    let pdf;
    const spots = [], pageItems = [], noTextPages = [];
    let crampedSignatureCount = 0;
    try {
        pdf = await task.promise;
        if (pdf.numPages > MAX_PAGES) throw detectionError('DETECTION_LIMIT', 'PDF has more than 200 pages');
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            let page;
            try {
                page = await pdf.getPage(pageNum);
                const geometry = pageGeometryFromPdfjsPage(page, FRONTEND_PAGE_RENDER_WIDTH);
                const content = await page.getTextContent();
                if (content.items.length > MAX_ITEMS_PER_PAGE) throw detectionError('DETECTION_LIMIT', 'PDF page has too many text items');
                const items = content.items.map(normalizeTextItem).filter(Boolean);
                if (!items.length) noTextPages.push(pageNum);
                pageItems.push(...items.map(item => ({ ...item, pageNum })));
                const { labels, lines } = splitTextUnderlines(items);
                // A scan cannot be understood without OCR. Vector extraction
                // alone does not turn it into a readable signature document.
                if (items.length) lines.push(...vectorUnderlines(await page.getOperatorList(), pdfjs));
                const candidates = candidateSpots(labels, lines, geometry, pageNum);
                spots.push(...candidates.spots);
                crampedSignatureCount += candidates.crampedSignatureCount;
            } catch (error) {
                if (error.code === 'DETECTION_LIMIT') throw error;
                throw detectionError('PDF_PAGE_FAILED', `Could not inspect PDF page ${pageNum}`);
            } finally { if (page) page.cleanup(); }
        }
        const unique = spots.filter((spot, i) => !spots.slice(0, i).some(other => other.pageNum === spot.pageNum
            && Math.abs(other.pdfAnchorX - spot.pdfAnchorX) <= 8 && Math.abs(other.pdfAnchorY - spot.pdfAnchorY) <= 4));
        const assigned = assignSignersToSpots(unique.sort((a, b) => a.pageNum - b.pageNum || a.y - b.y || a.x - b.x), signers, pageItems);
        const warnings = [{ code: 'REVIEW_REQUIRED' }];
        if (noTextPages.length) warnings.push({ code: 'NO_TEXT_LAYER', pages: noTextPages });
        if (crampedSignatureCount) warnings.push({ code: 'INSUFFICIENT_SIGNATURE_SPACE', count: crampedSignatureCount });
        if (!assigned.length && !crampedSignatureCount) warnings.push({ code: 'NO_SIGNATURE_CUES' });
        const unassigned = assigned.filter(spot => spot.assignmentStatus === 'unassigned').length;
        if (unassigned) warnings.push({ code: 'UNASSIGNED_SPOTS', count: unassigned });
        return { spots: assigned, warnings, noTextPages, pagesChecked: pdf.numPages, crampedSignatureCount };
    } catch (error) {
        if (error.code) throw error;
        throw detectionError('INVALID_PDF', 'PDF could not be inspected');
    } finally {
        if (pdf) await pdf.destroy(); else await task.destroy();
    }
}

// Compatibility for incumbent consumers; new callers use the detailed result.
async function detectHebrewSignatureSpotsFromPdfBuffer(buffer, signers = null) {
    return (await detectSignatureSpotsDetailed(buffer, signers)).spots;
}

function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        if (!stream) {
            return reject(new Error("Stream is null or undefined"));
        }

        const chunks = [];
        let totalSize = 0;
        const MAX_FILE_SIZE = 50 * 1024 * 1024;

        stream.on("data", (chunk) => {
            if (!chunk) return;

            totalSize += chunk.length;
            if (totalSize > MAX_FILE_SIZE) {
                stream.destroy();
                reject(new Error(`File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`));
                return;
            }

            chunks.push(chunk);
        });

        stream.on("end", () => {
            if (chunks.length === 0) {
                reject(new Error("Stream ended with no data"));
                return;
            }
            try {
                const buffer = Buffer.concat(chunks);
                if (buffer.length === 0) {
                    reject(new Error("Resulting buffer is empty"));
                    return;
                }
                resolve(buffer);
            } catch (err) {
                reject(new Error(`Failed to concatenate buffers: ${err.message}`));
            }
        });

        stream.on("error", (err) => {
            reject(new Error(`Stream error: ${err.message}`));
        });

        // Handle premature close
        stream.on("close", () => {
            if (chunks.length > 0) {
                try {
                    resolve(Buffer.concat(chunks));
                } catch (err) {
                    reject(new Error(`Failed to concatenate buffers on close: ${err.message}`));
                }
            } else {
                reject(new Error("Stream closed with no data"));
            }
        });
    });
}


module.exports = { detectHebrewSignatureSpotsFromPdfBuffer, detectSignatureSpotsDetailed, validateSigners, streamToBuffer, FRONTEND_PAGE_RENDER_WIDTH, assignSignersToSpots };
