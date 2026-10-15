const { expect } = require('../../lib/signingV2/errors');
const { signatureImage, IMAGE_TYPES } = require('../../lib/signingV2/stamp');
const { bytesHash } = require('../../lib/signingV2/canonical');

// A drawing can cover multiple explicitly selected fields. Dedupe its bytes,
// while retaining the exact per-field assignment (signature, initials, stamp).
function fieldDrawings(items, documents, input) {
    const allowed = new Map();
    for (const item of items) {
        const fields = new Map(documents.get(item.documentId).field_bindings.map(field => [field.id, field]));
        for (const id of item.fieldIds) if (IMAGE_TYPES.has(fields.get(id).type)) allowed.set(`${item.taskId}.${id}`, fields.get(id));
    }
    expect(input === undefined || Array.isArray(input), 'INVALID_VALUES');
    const records = input || [];
    expect(records.length <= allowed.size, 'INVALID_VALUES');
    const images = new Map(), bindings = {};
    let total = 0;
    for (const record of records) {
        expect(record && typeof record === 'object' && !Array.isArray(record), 'INVALID_VALUES');
        const raw = typeof record.image === 'string' ? record.image.replace(/^data:image\/png;base64,/, '') : '';
        total += raw.length;
        expect(raw.length > 0 && raw.length <= 420000 && total <= 8 * 1024 * 1024 && /^[A-Za-z0-9+/]+={0,2}$/.test(raw), 'INVALID_SIGNATURE');
        const bytes = Buffer.from(raw, 'base64'), hash = bytesHash(bytes);
        if (!images.has(hash)) images.set(hash, { bytes, hash, ...signatureImage(bytes) });
        expect(Array.isArray(record.fields) && record.fields.length > 0 && record.fields.length <= allowed.size, 'INVALID_VALUES');
        for (const ref of record.fields) {
            expect(ref && typeof ref === 'object' && typeof ref.taskId === 'string' && typeof ref.fieldId === 'string', 'INVALID_VALUES');
            const key = `${ref.taskId}.${ref.fieldId}`;
            expect(allowed.has(key) && !bindings[key], 'INVALID_VALUES', key);
            bindings[key] = hash;
        }
    }
    return { images, bindings, missing: [...allowed.entries()].some(([key, field]) => !bindings[key] && (input === undefined || field.required !== false)) };
}
module.exports = { fieldDrawings };
