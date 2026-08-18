'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../data');
const FILES = [
    { file: 'outreach-suppress.json', source: 'suppress' },
    { file: 'outreach-warm-leads.json', source: 'warm' },
];

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

/**
 * Emails that must never receive a mass outreach send.
 * Suppress = opt-out / not relevant. Warm = personal follow-up only.
 */
function loadOutreachSkipList() {
    const emails = new Set();
    const reasons = new Map();
    let suppressCount = 0;
    let warmCount = 0;

    for (const { file, source } of FILES) {
        const abs = path.join(DATA_DIR, file);
        if (!fs.existsSync(abs)) continue;
        let parsed;
        try {
            parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
        } catch (e) {
            console.warn(`[outreachLists] could not parse ${file}: ${e.message}`);
            continue;
        }
        const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
        for (const entry of entries) {
            const email = normalizeEmail(entry?.email);
            if (!email) continue;
            emails.add(email);
            if (!reasons.has(email)) {
                reasons.set(email, {
                    source,
                    reason: String(entry?.reason || source),
                    name: String(entry?.name || ''),
                });
            }
            if (source === 'suppress') suppressCount += 1;
            else warmCount += 1;
        }
    }

    return { emails, reasons, suppressCount, warmCount };
}

function skipReasonFor(skipList, email) {
    const hit = skipList.reasons.get(normalizeEmail(email));
    if (!hit) return null;
    const label = hit.source === 'warm' ? 'warm lead' : 'suppressed';
    return hit.reason ? `${label} (${hit.reason})` : label;
}

module.exports = { loadOutreachSkipList, skipReasonFor, normalizeEmail };
