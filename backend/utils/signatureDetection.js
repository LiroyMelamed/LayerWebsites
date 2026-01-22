const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const FRONTEND_PAGE_RENDER_WIDTH = 800;

function isTruthyEnv(value) {
    const v = String(value || "").trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
}

const SIG_DETECT_VERBOSE = isTruthyEnv(process.env.SIG_DETECT_VERBOSE);

function sigDetectVerboseLog(...args) {
    if (!SIG_DETECT_VERBOSE) return;
    console.log(...args);
}

function resolvePdfjsStandardFontDataUrl() {
    // Allow override (http(s)://... or file://...)
    const env = process.env.PDFJS_STANDARD_FONT_DATA_URL;
    if (env) return String(env);

    try {
        const pkgJsonPath = require.resolve("pdfjs-dist/package.json");
        const pkgRoot = path.dirname(pkgJsonPath);
        const standardFontsDir = path.join(pkgRoot, "standard_fonts");

        if (!fs.existsSync(standardFontsDir)) return null;

        // Ensure trailing slash so PDF.js can append filenames.
        const url = pathToFileURL(standardFontsDir + path.sep).href;
        return url;
    } catch (e) {
        return null;
    }
}

const KEYWORDS = [
    "חתימה",
    "חתום כאן",
    "חתימת",
];


const MIN_TEXT_UNDERLINE_CHARS = 6;
const MIN_TEXT_UNDERLINE_WIDTH = 30;

const DEFAULT_SPOT_HEIGHT = 50;

const SPOT_Y_OFFSET_PDF = 24;

function normalizeHebrew(str) {
    if (!str) return "";
    return str
        .replace(/\s+/g, " ")
        .replace(/[״"״]/g, '"')  // normalize different quote marks
        .replace(/\u202E/g, "")  // remove RTL override
        .replace(/\u202D/g, "")  // remove LTR override
        .trim();
}

function hasHebKeyword(text) {
    const t = normalizeHebrew(text);
    if (!t) return false;

    // Only match if text is relatively short (likely a field label, not paragraph text)
    // Field labels are typically under 100 characters
    if (t.length > 100) return false;

    // Check keywords in order (longest first to avoid substring matches)
    // This prevents "בדיקה מסמכים" from matching "בדיקה מסמכים 2" or "בדיקה מסמכים 3"
    for (const k of KEYWORDS) {
        const normalized = normalizeHebrew(k);
        // Match keyword as complete word or with colon/punctuation
        // Create regex pattern that matches: "שם :", "שם", "ת.ז", "ת"ז" etc.
        const patterns = [
            normalized + "\\s*:",  // "שם :"
            "^" + normalized + "$",  // exactly the word
            normalized + "\\s*" + normalized,  // "שם ומשפחה" style
        ];
        if (patterns.some(p => new RegExp(p).test(t))) {
            return true;
        }
        // For short texts, allow substring match as fallback
        if (t.length < 40 && t.includes(normalized)) {
            return true;
        }
    }
    return false;
}

function keywordType(text) {
    const t = normalizeHebrew(text);
    // Check in order (longest first) to avoid substring matches
    if (t.includes("חתום כאן")) return "חתום כאן";
    if (t.includes("חתימה") || t.includes("חתימת")) return "חתימה";
    if (t.includes("שם") || t.includes("שם ומשפחה")) return "שם";
    if (t.includes("ת.ז") || t.includes('ת"ז')) return 'ת"ז';
    if (t.includes("תאריך")) return "תאריך";
    return "חתימה";
}

function mapSignerName(kind) {
    if (kind === "חתימה" || kind === "חתום כאן") return "חתימה ✍️";
    if (kind === "שם") return "שם ✍️";
    if (kind === 'ת"ז') return 'ת"ז ✍️';
    if (kind === "תאריך") return "תאריך ✍️";
    return "חתימה ✍️";
}

function normalizeTextItem(it) {
    if (!it || !it.str) return null;

    const str = normalizeHebrew(it.str);
    if (!str) return null;  // Skip empty items

    const t = it.transform || [1, 0, 0, 1, 0, 0];
    const x = t[4] || 0;
    const y = t[5] || 0;
    const width = Math.abs(it.width || 0);
    const height = Math.abs(t[3] || 10) || 10;

    return { str, x, y, width, height };
}

function isUnderlineText(str) {
    const s = (str || "").replace(/\s+/g, "");
    if (s.length < MIN_TEXT_UNDERLINE_CHARS) return false;
    if (/^_+$/.test(s)) return true;
    if (/^[\-\u2014]+$/.test(s)) return true;
    return false;
}

function makeSpotFromLine(line, pageNum, signerName) {
    const xOffset = -68;

    return {
        pageNum,
        x: line.x + xOffset,
        y: line.y + SPOT_Y_OFFSET_PDF,
        width: Math.min(Math.max(line.width, 120), 260),
        height: DEFAULT_SPOT_HEIGHT,
        signerName,
        isRequired: true,
        confidence: line.source === "text-underline" ? 0.95 : 0.90,
        source: line.source,
    };
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

async function loadPdfjs() {
    // works with pdfjs-dist@4.x in Node (ESM)
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    return pdfjs;
}

async function detectHebrewSignatureSpotsFromPdfBuffer(buffer, signers = null) {
    if (!buffer || buffer.length === 0) {
        throw new Error("Invalid PDF buffer: empty or null");
    }

    const pdfjs = await loadPdfjs();

    const standardFontDataUrl = resolvePdfjsStandardFontDataUrl();
    if (!standardFontDataUrl) {
        console.warn('[sig-detect] pdfjs standardFontDataUrl is not set; standard font metrics may be degraded');
    } else {
        sigDetectVerboseLog('[sig-detect] pdfjs standardFontDataUrl enabled');
    }

    const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(buffer),
        ...(standardFontDataUrl ? { standardFontDataUrl } : {}),
    });
    const pdf = await loadingTask.promise;

    const allSpots = [];
    const allPageItems = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        try {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1 });

            const textContent = await page.getTextContent();
            const items = (textContent.items || [])
                .map(normalizeTextItem)
                .filter((it) => it !== null && it.str);

            allPageItems.push(
                ...items.map((it) => ({
                    ...it,
                    pageNum,
                }))
            );

            const yMap = {};
            for (const it of items) {
                const y = Math.round(it.y * 2) / 2;
                if (!yMap[y]) yMap[y] = [];
                yMap[y].push(it);
            }

            for (const yStr of Object.keys(yMap)) {
                const y = parseFloat(yStr);
                const itemsAtY = yMap[yStr];

                const hasKeyword = itemsAtY.some(it => hasHebKeyword(it.str));
                const hasUnderline = itemsAtY.some(it => isUnderlineText(it.str) && (it.width || 0) >= MIN_TEXT_UNDERLINE_WIDTH);

                const hasShortText = itemsAtY.some(it =>
                    it.str && it.str.trim().length > 1 && it.str.trim().length < 100 &&
                    /[\u0590-\u05FF]/.test(it.str)
                );

                if ((!hasKeyword && !hasShortText) || !hasUnderline) continue;

                const keywordItems = itemsAtY.filter(it => hasHebKeyword(it.str));
                const shortTextItems = itemsAtY.filter(it =>
                    it.str && it.str.trim().length > 1 && it.str.trim().length < 100 &&
                    /[\u0590-\u05FF]/.test(it.str)
                );
                const keywords = keywordItems.length > 0 ? keywordItems : shortTextItems;
                const underlines = itemsAtY.filter(it => isUnderlineText(it.str) && (it.width || 0) >= MIN_TEXT_UNDERLINE_WIDTH);

                sigDetectVerboseLog(`[sig-detect] page=${pageNum} found signature section at y=${y} with ${keywords.length} keywords and ${underlines.length} underlines`);

                const usedKeywordIndices = new Set();

                for (const ul of underlines) {
                    let bestKeywordIdx = -1;
                    let bestDistance = Infinity;

                    for (let i = 0; i < keywords.length; i++) {
                        if (usedKeywordIndices.has(i)) continue;

                        const kw = keywords[i];
                        const dx = Math.abs(ul.x + ul.width / 2 - (kw.x + kw.width / 2));
                        if (dx < bestDistance) {
                            bestDistance = dx;
                            bestKeywordIdx = i;
                        }
                    }

                    if (bestKeywordIdx >= 0 && bestDistance < 150) {
                        const bestKeyword = keywords[bestKeywordIdx];
                        usedKeywordIndices.add(bestKeywordIdx);

                        let signerName = mapSignerName(keywordType(bestKeyword.str));
                        if (!hasKeyword) {
                            signerName = (bestKeyword.str || "חתימה").trim() + " ✍️";
                        }

                        const spotPdf = makeSpotFromLine(ul, pageNum, signerName);
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
                                // Keep original PDF coordinates for accurate matching against PDF text items
                                pdfX: spotPdf.x,
                                pdfY: spotPdf.y,
                                pdfWidth: spotPdf.width,
                                pdfHeight: spotPdf.height,
                                // Anchor at the underline position (before we shift the rect down).
                                // This aligns with signer labels which are typically on the underline baseline.
                                pdfAnchorX: ul.x + (ul.width || 0) / 2,
                                pdfAnchorY: ul.y,
                                signerName: spotPdf.signerName,
                                isRequired: true,
                                confidence: 0.95,
                                source: "signature-section",
                            },
                            pageWidthPx,
                            pageHeightPx
                        );

                        allSpots.push(clamped);
                        sigDetectVerboseLog(`[sig-detect] page=${pageNum} added spot: "${clamped.signerName}" at (${clamped.x}, ${clamped.y})`);
                    }
                }
            }
        } catch (e) {
            console.error(`[sig-detect] page=${pageNum} processing error:`, e);
            continue;
        }
    }

    let spots = dedupe(allSpots, 22);

    const extractedChars = allPageItems.reduce((sum, it) => sum + String(it?.str || "").length, 0);
    const pagesWithText = new Set(allPageItems.map((it) => it.pageNum)).size;
    console.log(`[sig-detect] extracted text summary: pages=${pdf.numPages} pagesWithText=${pagesWithText} items=${allPageItems.length} chars=${extractedChars}`);

    if (SIG_DETECT_VERBOSE) {
        console.log('[sig-detect] ========== ALL EXTRACTED TEXT ITEMS ==========');
        const itemsByPage = {};
        for (const item of allPageItems) {
            if (!itemsByPage[item.pageNum]) itemsByPage[item.pageNum] = [];
            itemsByPage[item.pageNum].push(item);
        }
        for (const page of Object.keys(itemsByPage).sort((a, b) => a - b)) {
            console.log(`[sig-detect] PAGE ${page}:`);
            itemsByPage[page].forEach(item => {
                console.log(`[sig-detect]   "${item.str}" at x=${item.x.toFixed(2)}, y=${item.y.toFixed(2)}`);
            });
        }
        console.log('[sig-detect] ================================================\n');
    }

    spots = spots
        .sort(
            (a, b) =>
                (b.confidence || 0) - (a.confidence || 0) ||
                a.pageNum - b.pageNum ||
                b.y - a.y  // Descending Y: highest Y (top of page visually) comes first
        );

    const spotsByPageAndName = {};
    spots.forEach(spot => {
        const key = `${spot.pageNum}-${spot.signerName}`;
        if (!spotsByPageAndName[key]) {
            spotsByPageAndName[key] = [];
        }
        spotsByPageAndName[key].push(spot);
    });

    spots = spots.map(spot => {
        const key = `${spot.pageNum}-${spot.signerName}`;
        const duplicates = spotsByPageAndName[key];
        if (duplicates.length > 1) {
            const sorted = duplicates.sort((a, b) => a.y - b.y);
            const index = sorted.findIndex(s => s === spot);
            if (index >= 0) {
                return {
                    ...spot,
                    signerName: `${spot.signerName.replace(' ✍️', '')} ${index + 1} ✍️`,
                };
            }
        }
        return spot;
    });

    if (signers && signers.length > 0) {
        console.log(`[sig-detect] smart-match assignment start: signerCount=${signers.length} spotsBefore=${spots.length}`);
        sigDetectVerboseLog('[sig-detect] ========== CALLING SMART MATCH ASSIGNMENT ==========');
        sigDetectVerboseLog('[sig-detect] Signers passed to assignment:', signers.map(s => ({
            name: typeof s === 'string' ? s : (s.name || s.Name || '?'),
            userId: typeof s === 'string' ? null : (s.userId || s.UserId || null)
        })));
        spots = assignSignersToSpots(spots, signers, allPageItems);
        console.log(`[sig-detect] smart-match assignment done: spotsAfter=${spots.length}`);
    }

    console.log(`[sig-detect] final result: ${spots.length} spots detected`);
    return spots;
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

function assignSignersToSpots(spots, signers, pageItems = null) {
    if (!signers || signers.length === 0) {
        return spots;
    }

    if (pageItems && pageItems.length > 0) {
        return assignSignersToSpotsSmartMatch(spots, signers, pageItems);
    }

    return assignSignersToSpotsRoundRobin(spots, signers);
}

/**
 * Smart matching: finds signer names near signature spots
 */
function assignSignersToSpotsSmartMatch(spots, signers, pageItems) {
    const smartMatchLog = (...args) => {
        if (!SIG_DETECT_VERBOSE) return;
        console.log(...args);
    };

    const normalizeText = (text) => {
        if (!text) return "";
        return text
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
    };

    const signerNameMap = signers.map((signer, idx) => {
        // Support both 'name' and 'Name' properties (frontend uses 'Name' from API)
        const name = typeof signer === 'string' ? signer : (signer.name || signer.Name || '');
        const parts = name
            .split(/\s+/)
            .map((p) => normalizeText(p))
            .filter((p) => p.length > 0);

        return {
            index: idx,
            signer,
            name,
            normalized: normalizeText(name),
            parts,
        };
    });

    // Build a set of unique tokens across signers (e.g., first names).
    // This avoids matching on common tokens like "בדיקה" which appear in all names.
    const tokenFrequency = {};
    for (const s of signerNameMap) {
        for (const part of s.parts) {
            tokenFrequency[part] = (tokenFrequency[part] || 0) + 1;
        }
    }
    const uniqueTokens = new Set(
        Object.keys(tokenFrequency).filter((t) => tokenFrequency[t] === 1 && t.length > 1)
    );

    const tokenToSignerIndex = {};
    for (const s of signerNameMap) {
        for (const part of s.parts) {
            if (uniqueTokens.has(part)) {
                tokenToSignerIndex[part] = s.index;
            }
        }
    }

    // Precompute per-page candidates for signer labels found in the PDF text.
    // PDFJS sometimes splits a single Hebrew name into multiple items (e.g., "ליא" + "ב").
    // To handle that, we group items by (page, y) and join them (right-to-left by x).
    const pageCandidates = {};
    const itemsByPageAndLine = {};

    const lineKey = (pageNum, y) => {
        const yKey = Math.round((y || 0) * 2) / 2; // group by half-point
        return `${pageNum}::${yKey}`;
    };

    for (const item of pageItems) {
        if (!item || !item.str || !item.pageNum) continue;
        const key = lineKey(item.pageNum, item.y);
        if (!itemsByPageAndLine[key]) itemsByPageAndLine[key] = [];
        itemsByPageAndLine[key].push(item);
    }

    for (const key of Object.keys(itemsByPageAndLine)) {
        const items = itemsByPageAndLine[key];
        if (!items || items.length === 0) continue;

        const pageNum = items[0].pageNum;
        const y = items[0].y || 0;

        // Join fragments right-to-left to reconstruct Hebrew words.
        const joined = normalizeText(
            items
                .slice()
                .sort((a, b) => (b.x || 0) - (a.x || 0))
                .map((it) => it.str)
                .join('')
        );

        for (const token of uniqueTokens) {
            if (!joined || !joined.includes(token)) continue;
            const signerIndex = tokenToSignerIndex[token];
            if (signerIndex === undefined) continue;

            // Use the rightmost x as the label anchor.
            const rightmostX = items.reduce((mx, it) => Math.max(mx, it.x || 0), 0);

            if (!pageCandidates[pageNum]) pageCandidates[pageNum] = [];
            pageCandidates[pageNum].push({
                signerIndex,
                token,
                x: rightmostX,
                y,
                raw: joined,
            });
        }
    }

    smartMatchLog('[smart-match] ========== SMART MATCH START ==========');
    smartMatchLog('[smart-match] Total spots to assign:', spots.length);
    smartMatchLog('[smart-match] Unique tokens used for matching:', Array.from(uniqueTokens));
    console.log(`[smart-match] summary: spots=${spots.length} uniqueTokens=${uniqueTokens.size} candidatePages=${Object.keys(pageCandidates).length}`);

    const assignedSpots = spots.map((spot) => {
        const spotPdfX = typeof spot.pdfAnchorX === 'number'
            ? spot.pdfAnchorX
            : (typeof spot.pdfX === 'number' ? spot.pdfX : (spot.x || 0));
        const spotPdfY = typeof spot.pdfAnchorY === 'number'
            ? spot.pdfAnchorY
            : (typeof spot.pdfY === 'number' ? spot.pdfY : (spot.y || 0));

        smartMatchLog(`\n[smart-match] === SPOT ${spots.indexOf(spot) + 1} === page ${spot.pageNum}, uiY=${(spot.y || 0).toFixed(2)}, pdfAnchorY=${spotPdfY.toFixed(2)}`);

        // 1) Best path: match using signer label tokens found on the same page.
        const candidates = pageCandidates[spot.pageNum] || [];
        if (candidates.length > 0) {
            let best = null;
            for (const c of candidates) {
                const vertDist = Math.abs((c.y || 0) - spotPdfY);
                const horizDist = Math.abs((c.x || 0) - spotPdfX);
                const score = vertDist * 10 + horizDist;

                if (!best || score < best.score) {
                    best = { ...c, score, vertDist, horizDist };
                }
            }

            // If the closest label is reasonably close vertically, trust it.
            if (best && best.vertDist < 60) {
                const signer = signers[best.signerIndex];
                const signerName = typeof signer === 'string' ? signer : (signer.name || signer.Name || '');
                smartMatchLog(
                    `[smart-match]   ✓ LABEL MATCH: token="${best.token}" ("${best.raw}") -> signer ${best.signerIndex} "${signerName}" (pdfVertDist=${best.vertDist.toFixed(
                        1
                    )}, pdfHorizDist=${best.horizDist.toFixed(1)})`
                );

                return {
                    ...spot,
                    signerIndex: best.signerIndex,
                    signerName,
                    signerUserId: typeof signer === 'string' ? null : (signer.userId || signer.UserId || null),
                };
            }
        }

        // FALLBACK: Try to match signer names from nearby text
        const nearbyItems = pageItems.filter((item) => {
            if (!item.str || item.pageNum !== spot.pageNum) return false;
            const verticalDistance = Math.abs((item.y || 0) - spotPdfY);
            return verticalDistance < 160;  // PDF-space: signer labels are close to their underline
        });

        smartMatchLog(`[smart-match] Found ${nearbyItems.length} nearby items (pdf vertical distance < 160):`);
        nearbyItems.forEach(item => {
            const vertDist = Math.abs((item.y || 0) - spotPdfY);
            smartMatchLog(`[smart-match]   "${item.str}" at x=${item.x.toFixed(2)}, y=${item.y.toFixed(2)} (pdfVertDist=${vertDist.toFixed(2)})`);
        });

        // Strategy: Match signers based on which signer names appear in nearby text
        // Build a map of which signer indices have names present in nearby items
        const presentSigners = new Set();  // signerIndex values
        const signerToClosestDist = {};  // signerIndex -> closest distance to their name

        for (const item of nearbyItems) {
            const itemText = normalizeText(item.str);
            const vertDist = Math.abs((item.y || 0) - spotPdfY);
            const horizDist = Math.abs((item.x || 0) - spotPdfX);
            const totalDist = vertDist * 10 + horizDist;  // Strongly penalize vertical distance

            for (const signerInfo of signerNameMap) {
                // Check if this item contains parts of this signer's name  
                // Prefer matching the first name (most distinctive part) over last name
                let matched = false;
                let matchScore = 0;  // Track quality of match: full name > first name > last name

                for (let partIdx = 0; partIdx < signerInfo.parts.length; partIdx++) {
                    const part = signerInfo.parts[partIdx];
                    // Prefer unique tokens only; shared tokens (like last name) are allowed but lower quality
                    if (part.length > 1 && itemText.includes(part)) {
                        matched = true;
                        const uniquenessBonus = uniqueTokens.has(part) ? 200 : 0;
                        const positionScore = 100 / (partIdx + 1);
                        matchScore = Math.max(matchScore, uniquenessBonus + positionScore);
                    }
                }

                if (matched) {
                    presentSigners.add(signerInfo.index);
                    // Store the match score along with distance
                    if (!signerToClosestDist[signerInfo.index]) {
                        signerToClosestDist[signerInfo.index] = { totalDist, matchScore };
                    } else {
                        // Keep the match with better score, and if tied, better distance
                        const existing = signerToClosestDist[signerInfo.index];
                        if (matchScore > existing.matchScore ||
                            (matchScore === existing.matchScore && totalDist < existing.totalDist)) {
                            signerToClosestDist[signerInfo.index] = { totalDist, matchScore };
                        }
                    }

                    const signerName = signers[signerInfo.index].name || signers[signerInfo.index].Name || signers[signerInfo.index];
                    const matchPart = signerInfo.parts.find(p => p.length > 1 && itemText.includes(p));
                    smartMatchLog(`[smart-match]     ✓ Matched signer ${signerInfo.index} "${signerName}" - found part "${matchPart}" (score=${matchScore.toFixed(0)}) in "${item.str}" at distance ${totalDist.toFixed(0)}pt`);
                    break;  // Found a match for this signer in this item, move to next signer
                }
            }
        }

        // If we found exactly one signer name nearby, use it
        if (presentSigners.size === 1) {
            bestSignerIndex = Array.from(presentSigners)[0];
            const signerName = signers[bestSignerIndex].name || signers[bestSignerIndex].Name || signers[bestSignerIndex];
            const distInfo = signerToClosestDist[bestSignerIndex];
            smartMatchLog(`[smart-match]   ✓ UNIQUE MATCH: signer ${bestSignerIndex} "${signerName}" (distance=${distInfo.totalDist.toFixed(2)}, score=${distInfo.matchScore.toFixed(0)})`);
            return {
                ...spot,
                signerIndex: bestSignerIndex,
                signerName: signerName,
                signerUserId: typeof signers[bestSignerIndex] === 'string' ? null : (signers[bestSignerIndex].userId || signers[bestSignerIndex].UserId || null),
            };
        }

        // If we found multiple signers, pick the one with the best match score, then closest distance
        if (presentSigners.size > 1) {
            const signerDistances = Array.from(presentSigners)
                .map(idx => ({
                    index: idx,
                    name: signers[idx].name || signers[idx].Name || signers[idx],
                    ...signerToClosestDist[idx]
                }))
                .sort((a, b) => {
                    // Sort by match score DESC (higher is better), then by distance ASC (lower is better)
                    if (b.matchScore !== a.matchScore) {
                        return b.matchScore - a.matchScore;
                    }
                    return a.totalDist - b.totalDist;
                });

            bestSignerIndex = signerDistances[0].index;
            smartMatchLog(`[smart-match]   Candidates: ${signerDistances.map(s => `signer ${s.index} (score=${s.matchScore.toFixed(0)}, dist=${s.totalDist.toFixed(0)}pt)`).join(', ')} -> chose signer ${bestSignerIndex}`);
            const signerName = signers[bestSignerIndex].name || signers[bestSignerIndex].Name || signers[bestSignerIndex];
            const distInfo = signerToClosestDist[bestSignerIndex];
            smartMatchLog(`[smart-match]   ✓ CLOSEST MATCH: signer ${bestSignerIndex} "${signerName}" (score=${distInfo.matchScore.toFixed(0)}, distance=${distInfo.totalDist.toFixed(2)}, from ${presentSigners.size} present)`);
            return {
                ...spot,
                signerIndex: bestSignerIndex,
                signerName: signerName,
                signerUserId: typeof signers[bestSignerIndex] === 'string' ? null : (signers[bestSignerIndex].userId || signers[bestSignerIndex].UserId || null),
            };
        }

        // No signer name found
        smartMatchLog(`[smart-match]   ❌ UNASSIGNED: spot page ${spot.pageNum} - NO SIGNER NAME FOUND`);
        return { ...spot, _unassigned: true };
    });

    let signerIndex = 0;
    const finalSpots = assignedSpots.map((spot) => {
        if (spot._unassigned) {
            const signer = signers[signerIndex % signers.length];
            const signerName = typeof signer === 'string' ? signer : (signer.name || signer.Name || '');
            const signerUserId = typeof signer === 'string' ? null : (signer.userId || signer.UserId || null);
            smartMatchLog(`[smart-match]   (ROUND-ROBIN FALLBACK) page ${spot.pageNum} -> signer ${signerIndex % signers.length} "${signerName}"`);
            const assignment = {
                ...spot,
                signerIndex: signerIndex % signers.length,
                signerName: signerName,
                signerUserId: signerUserId,
            };
            delete assignment._unassigned;
            signerIndex++;
            return assignment;
        }
        return spot;
    });

    return finalSpots;
}

/**
 * Simple round-robin assignment across signers
 */
function assignSignersToSpotsRoundRobin(spots, signers) {
    const spotsByPage = {};
    for (const spot of spots) {
        const pageNum = spot.pageNum || 1;
        if (!spotsByPage[pageNum]) {
            spotsByPage[pageNum] = [];
        }
        spotsByPage[pageNum].push(spot);
    }

    let signerIndex = 0;
    const assignedSpots = [];

    for (const pageNum of Object.keys(spotsByPage).sort((a, b) => a - b)) {
        // Frontend coords: lower Y is higher on the page
        const pageSpots = spotsByPage[pageNum].sort((a, b) => (a.y || 0) - (b.y || 0));

        for (const spot of pageSpots) {
            const signer = signers[signerIndex % signers.length];
            const signerName = typeof signer === 'string' ? signer : (signer.name || signer.Name || '');
            const signerUserId = typeof signer === 'string' ? null : (signer.userId || signer.id || null);

            assignedSpots.push({
                ...spot,
                signerIndex: signerIndex % signers.length,
                signerName: signerName,
                signerUserId: signerUserId,
            });
            signerIndex++;
        }
    }

    return assignedSpots;
}

module.exports = {
    detectHebrewSignatureSpotsFromPdfBuffer,
    streamToBuffer,
    FRONTEND_PAGE_RENDER_WIDTH,
    assignSignersToSpots,
};
