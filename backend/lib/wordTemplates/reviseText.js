'use strict';
const { importDocx, createBinding, materializeDocx, WordTemplateError } = require('./index');
const fail = code => { throw new WordTemplateError(code); };
const paragraph = (model, part, id) => model.parts.find(p => p.name === part)?.paragraphs.find(p => p.id === id);

// Change exactly one verified source selection. Never rewrite the whole document
// through HTML and never silently carry a binding across changed source text.
function reviseText(bytes, { sourceHash, anchor, replacement, bindings = [] }) {
    const model = importDocx(bytes);
    if (!Array.isArray(bindings) || bindings.length > 1000) fail('INVALID_BINDINGS');
    if (model.sourceHash !== sourceHash || !anchor || anchor.sourceHash !== sourceHash) fail('STALE_DOCX_SOURCE');
    if (typeof replacement !== 'string' || replacement.length > 10000 || /[\r\n\t]/u.test(replacement)) fail('INVALID_FIELD_VALUE');
    const old = paragraph(model, anchor.part, anchor.paragraphId);
    if (!old || old.textHash !== anchor.paragraphHash) fail('STALE_DOCX_SOURCE');
    if (anchor.kind === 'insert') fail('UNSUPPORTED_SELECTION');
    const edit = createBinding(model, { ...anchor, id: 'sourceTextRevision', field: 'manual.sourceTextRevision', fieldLabel: 'Source text', required: false });
    if (anchor.selectedTextHash !== edit.selectedTextHash) fail('STALE_OR_INVALID_BINDING');
    if (old.text.slice(edit.start, edit.end) === replacement) fail('WORD_TEXT_UNCHANGED');
    const result = materializeDocx(bytes, { sourceHash, bindings: [edit], values: { [edit.field]: replacement } });
    const next = importDocx(result.buffer);
    const delta = replacement.length - (edit.end - edit.start);
    const invalidated = [];
    const nextBindings = [];
    for (const binding of bindings) {
        const verified = createBinding(model, binding);
        if (Object.keys(verified).some(key => verified[key] !== binding[key])) fail('STALE_OR_INVALID_BINDING');
        const same = binding.part === edit.part && binding.paragraphId === edit.paragraphId;
        const intersects = same && (binding.kind === 'insert'
            ? binding.start >= edit.start && binding.start <= edit.end
            : binding.start < edit.end && binding.end > edit.start);
        if (intersects) { invalidated.push(binding.id); continue; }
        const shift = same && binding.start >= edit.end ? delta : 0;
        const target = paragraph(next, binding.part, binding.paragraphId);
        if (!target || (!same && target.text !== paragraph(model, binding.part, binding.paragraphId)?.text)) fail('WORD_REVISION_MISMATCH');
        nextBindings.push(createBinding(next, { ...binding, sourceHash: next.sourceHash, paragraphHash: target.textHash,
            start: binding.start + shift, end: binding.end + shift }));
    }
    for (const part of model.parts) for (const p of part.paragraphs) {
        const expected = part.name === edit.part && p.id === edit.paragraphId
            ? p.text.slice(0, edit.start) + replacement + p.text.slice(edit.end) : p.text;
        if (paragraph(next, part.name, p.id)?.text !== expected) fail('WORD_REVISION_MISMATCH');
    }
    return { ...result, model: next, bindings: nextBindings, invalidatedBindingIds: invalidated };
}
module.exports = { reviseText };
