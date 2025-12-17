const FRONTEND_PAGE_RENDER_WIDTH = 800;

const KEYWORDS = [
    "חתימה",
    "חתום כאן",
    "שם",
    "שם ומשפחה",
    "ת.ז",
    'ת"ז',
    "תאריך",
    "חתימת",
];

const MAX_KEYWORD_TO_LINE_DX = 260;
const MAX_KEYWORD_TO_LINE_DY = 28;

const MIN_LINE_LENGTH = 140;
const MAX_LINE_THICKNESS = 6;

const DEFAULT_SPOT_HEIGHT = 50;
const SPOT_PADDING_Y = 8;

function normalizeHebrew(str) {
    return (str || "")
        .replace(/\s+/g, " ")
        .replace(/[״"]/g, '"')
        .trim();
}

function hasHebKeyword(text) {
    const t = normalizeHebrew(text);
    return KEYWORDS.some((k) => t.includes(k));
}

function keywordType(text) {
    const t = normalizeHebrew(text);
    if (t.includes("חתום כאן")) return "חתום כאן";
    if (t.includes("חתימה") || t.includes("חתימת")) return "חתימה";
=    if (t.includes("שם") || t.includes("שם ומשפחה")) return "שם";
    if (t.includes("ת.ז") || t.includes('ת"ז')) return 'ת"ז';
    if (t.includes("תאריך")) return "תאריך";
    return "חתימה";
}

function normalizeTextItem(it) {
    const str = normalizeHebrew(it.str);
    const t = it.transform || [1, 0, 0, 1, 0, 0];
    const x = t[4] || 0;
    const y = t[5] || 0;
    const width = it.width || 0;
    const height = Math.abs(t[3] || 10) || 10;
    return { str, x, y, width, height };
}

function toFrontendCoords(rect, viewportWidth, viewportHeight) {
    const scale = FRONTEND_PAGE_RENDER_WIDTH / viewportWidth;

    const x = rect.x * scale;
    const yTop = (viewportHeight - rect.y) * scale;
    const w = rect.width * scale;
    const h = rect.height * scale;

    return {
        x: Math.round(Math.max(0, x)),
        y: Math.round(Math.max(0, yTop)),
        width: Math.round(Math.max(20, w)),
        height: Math.round(Math.max(20, h)),
        scale,
    };
}

function clampToPage(spot, pageWidthPx, pageHeightPx) {
    const x = Math.max(0, Math.min(spot.x, pageWidthPx - spot.width));
    const y = Math.max(0, Math.min(spot.y, pageHeightPx - spot.height));
    return { ...spot, x: Math.round(x), y: Math.round(y) };
}

function dedupe(spots, thresholdPx = 18) {
    const out = [];
    for (const s of spots) {
        const exists = out.some(
            (o) =>
                o.pageNum === s.pageNum &&
                Math.abs(o.x - s.x) <= thresholdPx &&
                Math.abs(o.y - s.y) <= thresholdPx
        );
        if (!exists) out.push(s);
    }
    return out;
}

async function extractHorizontalLines(page, viewport) {
    const opList = await page.getOperatorList();
    const fnArray = opList.fnArray || [];
    const argsArray = opList.argsArray || [];

    const OPS = page._pdfjsOps;

    let curX = 0,
        curY = 0;
    const segments = [];
    let pathSegments = [];

    const pushLine = (x1, y1, x2, y2) => {
        pathSegments.push({ x1, y1, x2, y2 });
    };

    for (let i = 0; i < fnArray.length; i++) {
        const fn = fnArray[i];
        const args = argsArray[i] || [];

        if (fn === OPS.moveTo) {
            curX = args[0];
            curY = args[1];
        } else if (fn === OPS.lineTo) {
            const x = args[0];
            const y = args[1];
            pushLine(curX, curY, x, y);
            curX = x;
            curY = y;
        } else if (fn === OPS.constructPath) {
            const ops = args[0] || [];
            const coords = args[1] || [];
            let ci = 0;

            for (const op of ops) {
                if (op === 13) {
                    const x = coords[ci++];
                    const y = coords[ci++];
                    curX = x;
                    curY = y;
                } else if (op === 14) {
                    const x = coords[ci++];
                    const y = coords[ci++];
                    pushLine(curX, curY, x, y);
                    curX = x;
                    curY = y;
                } else {
                    if (op === 15) ci += 6;
                }
            }
        } else if (fn === OPS.stroke) {
            for (const s of pathSegments) segments.push(s);
            pathSegments = [];
        } else if (fn === OPS.endPath) {
            pathSegments = [];
        }
    }

    const lines = [];
    for (const s of segments) {
        const dx = s.x2 - s.x1;
        const dy = s.y2 - s.y1;
        const len = Math.sqrt(dx * dx + dy * dy);

        if (len < MIN_LINE_LENGTH) continue;
        if (Math.abs(dy) > 2.2) continue;

        const xLeft = Math.min(s.x1, s.x2);
        const xRight = Math.max(s.x1, s.x2);
        const y = (s.y1 + s.y2) / 2;

        if (xRight <= 0 || xLeft >= viewport.width) continue;
        if (y <= 0 || y >= viewport.height) continue;

        lines.push({
            x: xLeft,
            y,
            width: xRight - xLeft,
            height: DEFAULT_SPOT_HEIGHT,
        });
    }

    const out = [];
    for (const l of lines.sort((a, b) => a.y - b.y)) {
        const exists = out.some(
            (o) => Math.abs(o.y - l.y) < 2.5 && Math.abs(o.x - l.x) < 8 && Math.abs(o.width - l.width) < 10
        );
        if (!exists) out.push(l);
    }

    return out;
}

function findKeywordAnchors(items) {
    const anchors = [];
    for (const it of items) {
        if (!it.str) continue;
        if (!hasHebKeyword(it.str)) continue;

        anchors.push({
            x: it.x,
            y: it.y,
            width: it.width || 0,
            height: it.height || 10,
            text: it.str,
            kind: keywordType(it.str),
        });
    }
    return anchors;
}

function pickLineNearAnchor(lines, anchor) {
    let best = null;
    let bestScore = Infinity;

    for (const l of lines) {
        const dy = Math.abs(l.y - anchor.y);
        if (dy > MAX_KEYWORD_TO_LINE_DY) continue;

        const anchorCenterX = anchor.x + (anchor.width || 0) / 2;
        const lineCenterX = l.x + l.width / 2;
        const dx = Math.abs(lineCenterX - anchorCenterX);
        if (dx > MAX_KEYWORD_TO_LINE_DX) continue;

        const score = dy * 10 + dx;
        if (score < bestScore) {
            bestScore = score;
            best = l;
        }
    }

    return best;
}

function makeSpotFromLine(line, pageNum, signerName) {
    return {
        pageNum,
        x: line.x,
        y: line.y + SPOT_PADDING_Y,
        width: Math.min(Math.max(line.width, 120), 260),
        height: DEFAULT_SPOT_HEIGHT,
        signerName,
        isRequired: true,
        confidence: 0.92,
        source: "vector-line",
    };
}

function mapSignerName(kind) {
    if (kind === "חתימה" || kind === "חתום כאן") return "חתימה ✍️";
    if (kind === "שם") return "שם ✍️";
    if (kind === 'ת"ז') return 'ת"ז ✍️';
    if (kind === "תאריך") return "תאריך ✍️";
    return "חתימה ✍️";
}

async function loadPdfjs() {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    return pdfjs;
}

async function detectHebrewSignatureSpotsFromPdfBuffer(buffer) {
    const pdfjs = await loadPdfjs();

    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
    const pdf = await loadingTask.promise;

    const allSpots = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);

        page._pdfjsOps = pdfjs.OPS;

        const viewport = page.getViewport({ scale: 1 });

        const lines = await extractHorizontalLines(page, viewport);

        if (!lines.length) continue;

        const textContent = await page.getTextContent();
        const items = (textContent.items || [])
            .map(normalizeTextItem)
            .filter((it) => it.str);

        const anchors = findKeywordAnchors(items);
        if (!anchors.length) continue;

        for (const a of anchors) {
            const line = pickLineNearAnchor(lines, a);
            if (!line) continue;

            const spotPdf = makeSpotFromLine(line, pageNum, mapSignerName(a.kind));

            const spotUi = toFrontendCoords(spotPdf, viewport.width, viewport.height);

            const pageWidthPx = FRONTEND_PAGE_RENDER_WIDTH;
            const pageHeightPx = Math.round(viewport.height * spotUi.scale);

            const clamped = clampToPage(
                {
                    pageNum,
                    x: spotUi.x,
                    y: spotUi.y,
                    width: spotUi.width,
                    height: spotUi.height,
                    signerName: spotPdf.signerName,
                    isRequired: true,
                    confidence: spotPdf.confidence,
                    source: spotPdf.source,
                },
                pageWidthPx,
                pageHeightPx
            );

            allSpots.push(clamped);
        }
    }

    let spots = dedupe(allSpots, 22);

    spots = spots
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0) || b.y - a.y)
        .slice(0, 6);

    return spots;
}

function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
    });
}

module.exports = {
    detectHebrewSignatureSpotsFromPdfBuffer,
    streamToBuffer,
    FRONTEND_PAGE_RENDER_WIDTH,
};
