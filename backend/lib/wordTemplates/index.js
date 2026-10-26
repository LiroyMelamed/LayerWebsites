'use strict';

const crypto = require('node:crypto');
const path = require('node:path').posix;
const { SaxesParser } = require('saxes');
const { readZip, writeZip } = require('./zip');
const { WordTemplateError, reject } = require('./errors');

const WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CONTENT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const MAIN_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const STORY = /^word\/(?:document|header[1-9][0-9]*|footer[1-9][0-9]*)\.xml$/u;
const MAX_BINDINGS = 1000;
const FIELD_NAMES = Object.freeze([
    'client.fullName', 'client.companyName', 'client.identityNumber', 'client.companyNumber', 'client.address', 'client.email', 'client.phone',
    'case.reference', 'case.title', 'case.address', 'case.amount', 'case.date',
    'office.name', 'office.address', 'office.email', 'office.phone',
]);
const UNSUPPORTED = new Set(['ins', 'del', 'moveFrom', 'moveTo', 'fldSimple', 'fldChar', 'instrText', 'sdt', 'txbxContent', 'altChunk', 'object']);
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const xmlEscape = value => value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&apos;');
function validField(field) {
    return typeof field === 'string' && (FIELD_NAMES.includes(field)
        || /^role\.[A-Za-z0-9_-]{1,64}\.(?:fullName|companyName|identityNumber|companyNumber|capacity|authority)$/u.test(field));
}
function xmlString(data) {
    const value = data.toString('utf8');
    if (!Buffer.from(value).equals(data) || /<!\s*(?:DOCTYPE|ENTITY)/iu.test(value)) reject('UNSAFE_XML');
    return value;
}
function parseXml(xml, onOpen, onText, onClose) {
    const parser = new SaxesParser({ xmlns: true, defaultXMLVersion: '1.0', forceXMLVersion: true });
    parser.on('doctype', () => reject('UNSAFE_XML'));
    parser.on('processinginstruction', () => reject('UNSUPPORTED_XML_PROCESSING_INSTRUCTION'));
    if (onOpen) parser.on('opentag', onOpen);
    if (onText) parser.on('text', onText);
    if (onClose) parser.on('closetag', onClose);
    try { parser.write(xml).close(); }
    catch (error) { if (error instanceof WordTemplateError) throw error; reject('INVALID_XML'); }
}
function attribute(node, local) { return Object.values(node.attributes).find(a => a.local === local)?.value; }
function validatePackage(entries) {
    for (const part of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']) if (!entries.has(part)) reject('NOT_A_DOCX');
    if (entries.size > 1024) reject('DOCX_SIZE_LIMIT');
    for (const name of entries.keys()) {
        if (/(?:^|\/)(?:vbaProject|embeddings|activeX|_xmlsignatures)(?:[/.]|$)/iu.test(name)
            || /\.(?:bin|exe|dll|js|html|htm|svg)$/iu.test(name)) reject('ACTIVE_OR_SIGNED_PACKAGE_UNSUPPORTED');
    }
    let mainType = false;
    let rootDocument = false;
    let rootRelationship = false;
    for (const [name, entry] of entries) {
        if (!/\.(?:xml|rels|vml)$/iu.test(name)) continue;
        const xml = xmlString(entry.data);
        let instructionDepth = 0;
        let instructions = '';
        parseXml(xml, node => {
            if (node.uri === WORD && node.local === 'instrText') instructionDepth += 1;
            if (node.uri === WORD && node.local === 'fldSimple') instructions += attribute(node, 'instr') || '';
            if (name === '[Content_Types].xml' && node.uri === CONTENT && node.local === 'Override') {
                const type = attribute(node, 'ContentType');
                if (/macroEnabled|oleObject|activeX|vbaProject/iu.test(type || '')) reject('ACTIVE_OR_SIGNED_PACKAGE_UNSUPPORTED');
                if (attribute(node, 'PartName') === '/word/document.xml' && type === MAIN_TYPE) mainType = true;
            }
            if (name === 'word/document.xml' && node.uri === WORD && node.local === 'document') rootDocument = true;
            if (node.uri === WORD && ['altChunk', 'object'].includes(node.local)) reject('ACTIVE_CONTENT_UNSUPPORTED');
            // Raw legacy image/link references can resolve outside a package
            // even without a URI scheme. Internal OOXML images use r:embed/id.
            if (Object.values(node.attributes).some(a => ['src', 'href'].includes(a.local)
                && !a.value.startsWith('#'))) reject('EXTERNAL_OR_ACTIVE_RELATIONSHIP');
            if (name.endsWith('.rels') && node.uri === REL && node.local === 'Relationship') {
                const target = attribute(node, 'Target');
                const type = attribute(node, 'Type') || '';
                if (attribute(node, 'TargetMode') === 'External' || !target || /[:\\?#%\u0000-\u0020]/u.test(target)
                    || /(?:^|\/)(?:oleObject|attachedTemplate|aFChunk|vbaProject|package)$/iu.test(type)) reject('EXTERNAL_OR_ACTIVE_RELATIONSHIP');
                const base = name === '_rels/.rels' ? '' : path.dirname(path.dirname(name));
                const resolved = target.startsWith('/') ? target.slice(1) : path.normalize(path.join(base, target));
                if (resolved.startsWith('../') || !entries.has(resolved)) reject('BROKEN_PACKAGE_RELATIONSHIP');
                if (name === '_rels/.rels' && type === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument') {
                    if (rootRelationship || resolved !== 'word/document.xml') reject('UNSUPPORTED_MAIN_DOCUMENT');
                    rootRelationship = true;
                }
            }
        }, text => { if (instructionDepth) instructions += text; }, node => {
            if (node.uri === WORD && node.local === 'instrText') instructionDepth -= 1;
        });
        if (/\b(?:INCLUDETEXT|INCLUDEPICTURE|DDEAUTO|DDE|LINK|DATABASE)\b/iu.test(instructions)) reject('ACTIVE_WORD_FIELD_UNSUPPORTED');
    }
    if (!mainType || !rootDocument || !rootRelationship) reject('NOT_A_DOCX');
}

function storyModel(name, xml) {
    const paragraphs = [];
    const stack = [];
    let paragraph;
    let complexFieldDepth = 0;
    let malformedComplexField = false;
    const parser = new SaxesParser({ xmlns: true, defaultXMLVersion: '1.0', forceXMLVersion: true });
    parser.on('opentag', node => {
        const item = { node, start: xml.lastIndexOf('<', parser.position - 1), contentStart: parser.position, value: '' };
        stack.push(item);
        if (node.uri === WORD && node.local === 'p') {
            const reasons = stack.filter(s => s.node.uri === WORD && UNSUPPORTED.has(s.node.local)).map(s => s.node.local);
            if (complexFieldDepth) reasons.push('fldChar');
            paragraph = { id: `p${paragraphs.length}`, text: '', spans: [], unsupportedReasons: [...new Set(reasons)] };
            paragraphs.push(paragraph);
            item.paragraph = paragraph;
        }
        if (node.uri === WORD && node.local === 'fldChar') {
            const type = attribute(node, 'fldCharType');
            if (type === 'begin') complexFieldDepth += 1;
            else if (type === 'end' && complexFieldDepth) complexFieldDepth -= 1;
            else if (type !== 'separate' || !complexFieldDepth) malformedComplexField = true;
        }
        if (!paragraph || node.uri !== WORD) return;
        if (UNSUPPORTED.has(node.local) && !paragraph.unsupportedReasons.includes(node.local)) paragraph.unsupportedReasons.push(node.local);
        if (['tab', 'br', 'cr'].includes(node.local)) {
            const start = paragraph.text.length;
            paragraph.text += node.local === 'tab' ? '\t' : '\n';
            paragraph.spans.push({ start, end: start + 1, editable: false });
        }
    });
    parser.on('text', text => { const item = stack[stack.length - 1]; if (item?.node.uri === WORD && item.node.local === 't') item.value += text; });
    parser.on('cdata', () => reject('UNSUPPORTED_XML_CDATA'));
    parser.on('closetag', node => {
        const item = stack.pop();
        if (paragraph && node.uri === WORD && node.local === 't' && item.value.length) {
            const start = paragraph.text.length;
            paragraph.text += item.value;
            paragraph.spans.push({ start, end: paragraph.text.length, editable: true,
                xmlStart: item.contentStart, xmlEnd: xml.lastIndexOf('</', parser.position - 1),
                tagStart: item.start, tagEnd: item.contentStart, value: item.value });
        }
        if (item.paragraph) paragraph = [...stack].reverse().find(s => s.paragraph)?.paragraph;
    });
    try { parser.write(xml).close(); }
    catch (error) { if (error instanceof WordTemplateError) throw error; reject('INVALID_XML'); }
    for (const p of paragraphs) {
        // An unbalanced field may have cached results anywhere in this story.
        if ((complexFieldDepth || malformedComplexField) && !p.unsupportedReasons.includes('fldChar')) p.unsupportedReasons.push('fldChar');
        p.textHash = hash(p.text);
        p.editable = !p.unsupportedReasons.length;
        p.blanks = [...p.text.matchAll(/_{2,}|\u005f(?:[ \u00a0]*_){1,}/gu)].map(m => ({ start: m.index, end: m.index + m[0].length }));
    }
    return { name, paragraphs };
}

function load(buffer) {
    const entries = readZip(buffer);
    validatePackage(entries);
    const parts = [...entries].filter(([name]) => STORY.test(name)).map(([name, entry]) => storyModel(name, xmlString(entry.data)));
    return { entries, model: { version: 1, sourceHash: hash(buffer), offsetUnit: 'utf16', parts,
        limitations: ['No PDF layout or signing coordinates are inferred.', 'Tracked changes, fields, content controls and text boxes cannot be bound.'] } };
}

function importDocx(buffer) {
    const { model } = load(buffer);
    // Raw XML offsets are internal. A caller selects public paragraph text ranges.
    return { ...model, parts: model.parts.map(part => ({ ...part, paragraphs: part.paragraphs.map(({ spans, ...p }) => ({
        ...p, selectionRanges: spans.filter(s => s.editable).map(({ start, end }) => ({ start, end })),
    })) })) };
}
function findParagraph(model, partName, paragraphId) {
    const p = model.parts.find(part => part.name === partName)?.paragraphs.find(item => item.id === paragraphId);
    if (!p || !p.editable) reject('UNSUPPORTED_SELECTION');
    return p;
}
function rangeValid(p, start, end) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= end || end > p.text.length
        || (start && /[\uD800-\uDBFF]/u.test(p.text[start - 1]) && /[\uDC00-\uDFFF]/u.test(p.text[start]))
        || (end < p.text.length && /[\uD800-\uDBFF]/u.test(p.text[end - 1]) && /[\uDC00-\uDFFF]/u.test(p.text[end]))) reject('INVALID_SELECTION_RANGE');
    const ranges = p.spans ? p.spans.filter(s => s.editable) : p.selectionRanges;
    let covered = start;
    for (const span of ranges) if (span.start <= covered && span.end > covered) covered = Math.min(end, span.end);
    if (covered !== end) reject('UNSUPPORTED_SELECTION');
}
function createBinding(model, spec) {
    if (!model || model.version !== 1 || !/^[a-f0-9]{64}$/u.test(model.sourceHash || '')) reject('INVALID_IMPORT_MODEL');
    if (!spec || !/^[A-Za-z0-9_-]{1,64}$/u.test(spec.id || '') || !validField(spec.field)
        || (spec.required !== undefined && typeof spec.required !== 'boolean')) reject('INVALID_BINDING');
    const p = findParagraph(model, spec.part, spec.paragraphId);
    rangeValid(p, spec.start, spec.end);
    return { id: spec.id, sourceHash: model.sourceHash, part: spec.part, paragraphId: p.id,
        paragraphHash: p.textHash, start: spec.start, end: spec.end,
        selectedTextHash: hash(p.text.slice(spec.start, spec.end)), field: spec.field, required: spec.required !== false };
}
function materializeDocx(buffer, options) {
    const { entries, model } = load(buffer);
    if (!options || options.sourceHash !== model.sourceHash) reject('STALE_DOCX_SOURCE');
    const { bindings, values } = options;
    if (!Array.isArray(bindings) || !bindings.length || bindings.length > MAX_BINDINGS
        || !values || typeof values !== 'object' || Array.isArray(values)) reject('INVALID_BINDINGS');
    const ids = new Set();
    const replacements = new Map();
    const ranges = new Map();
    const manifest = [];
    for (const binding of bindings) {
        const canonical = createBinding(model, binding);
        if (ids.has(binding.id) || Object.keys(canonical).some(key => canonical[key] !== binding[key])) reject('STALE_OR_INVALID_BINDING');
        ids.add(binding.id);
        const p = findParagraph(model, binding.part, binding.paragraphId);
        const key = `${binding.part}:${p.id}`;
        const occupied = ranges.get(key) || [];
        if (occupied.some(r => binding.start < r.end && binding.end > r.start)) reject('OVERLAPPING_BINDINGS');
        occupied.push(binding); ranges.set(key, occupied);
        const supplied = Object.hasOwn(values, binding.field) ? values[binding.field] : undefined;
        if (supplied === undefined || supplied === null || (typeof supplied === 'string' && !supplied.trim())) {
            if (binding.required) reject('MISSING_REQUIRED_VALUE', { bindingId: binding.id, field: binding.field });
        } else if (typeof supplied !== 'string') reject('VALUE_MUST_BE_STRING', { bindingId: binding.id });
        const value = supplied == null ? '' : supplied;
        if (value.length > 10000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\r\n\t]/u.test(value)
            || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) reject('INVALID_FIELD_VALUE', { bindingId: binding.id });
        const edits = replacements.get(binding.part) || [];
        let first = true;
        for (const span of p.spans.filter(s => s.editable && binding.start < s.end && binding.end > s.start)) {
            edits.push({ span, from: Math.max(binding.start, span.start) - span.start,
                to: Math.min(binding.end, span.end) - span.start, value: first ? value : '' });
            first = false;
        }
        replacements.set(binding.part, edits);
        manifest.push({ bindingId: binding.id, field: binding.field, valueHash: hash(value) });
    }
    for (const [partName, edits] of replacements) {
        const entry = entries.get(partName);
        const xml = xmlString(entry.data);
        const spans = new Map();
        for (const edit of edits) { const list = spans.get(edit.span) || []; list.push(edit); spans.set(edit.span, list); }
        const patches = [];
        for (const [span, list] of spans) {
            let value = span.value;
            for (const edit of list.sort((a, b) => b.from - a.from)) value = value.slice(0, edit.from) + edit.value + value.slice(edit.to);
            patches.push({ start: span.xmlStart, end: span.xmlEnd, text: xmlEscape(value) });
            const tag = xml.slice(span.tagStart, span.tagEnd);
            if (!/\bxml:space\s*=/u.test(tag)) patches.push({ start: span.tagEnd - 1, end: span.tagEnd - 1, text: ' xml:space="preserve"' });
            else if (!/\bxml:space\s*=\s*['"]preserve['"]/u.test(tag)) reject('UNSUPPORTED_XML_SPACE');
        }
        let result = xml;
        for (const patch of patches.sort((a, b) => b.start - a.start)) result = result.slice(0, patch.start) + patch.text + result.slice(patch.end);
        parseXml(result);
        entry.data = Buffer.from(result); entry.changed = true;
    }
    const output = writeZip(entries);
    return { buffer: output, sourceHash: model.sourceHash, outputHash: hash(output), bindings: manifest,
        requiresPdfConversion: true, requiresFreshSigningGeometry: true };
}

module.exports = { importDocx, createBinding, materializeDocx, FIELD_NAMES, WordTemplateError };
