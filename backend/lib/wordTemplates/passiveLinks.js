'use strict';

const { SaxesParser } = require('saxes');
const { readZip, writeZip } = require('./zip');
const { WordTemplateError, reject } = require('./errors');
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const OFFICE_NAMESPACES = new Set([OFFICE, 'http://purl.oclc.org/ooxml/officeDocument/relationships']);
const WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function scan(data, open, close) {
    const xml = data.toString('utf8');
    if (!Buffer.from(xml).equals(data) || /<!\s*(?:DOCTYPE|ENTITY)/iu.test(xml)) reject('UNSAFE_XML');
    const parser = new SaxesParser({ xmlns: true });
    parser.on('doctype', () => reject('UNSAFE_XML'));
    parser.on('processinginstruction', () => reject('UNSUPPORTED_XML_PROCESSING_INSTRUCTION'));
    const stack = [];
    parser.on('opentag', node => {
        const item = { node, start: xml.lastIndexOf('<', parser.position - 1), end: parser.position };
        stack.push(item); open?.(item);
    });
    parser.on('closetag', () => {
        const item = stack.pop();
        close?.(item, item.node.isSelfClosing ? item.start : xml.lastIndexOf('<', parser.position - 1), parser.position);
    });
    try { parser.write(xml).close(); }
    catch (error) { if (error instanceof WordTemplateError) throw error; reject('INVALID_XML'); }
    return xml;
}
const attr = (node, name) => node.attributes[name]?.value;
const remove = (xml, spans) => {
    for (const [start, end] of spans.sort((a, b) => b[0] - a[0])) xml = xml.slice(0, start) + xml.slice(end);
    return Buffer.from(xml);
};
function passiveTarget(value) {
    if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u0020\u007f\\]/u.test(value)) return false;
    try { return ['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(value).protocol); } catch { return false; }
}

// Keep visible runs/formatting but remove clickable external links before storage
// or conversion. The unchanged strict package validator still checks the result.
// This never follows a URL or permits external images/templates/active content.
function normalizePassiveLinks(buffer) {
    const entries = readZip(buffer);
    let changed = false;
    for (const [name, entry] of entries) {
        if (!/^word\/_rels\/[^/]+\.xml\.rels$/u.test(name)) continue;
        const ids = new Set(); const allIds = new Set(); const removals = [];
        const xml = scan(entry.data, ({ node }) => {
            if (node.uri !== REL || node.local !== 'Relationship') return;
            const id = attr(node, 'Id');
            if (!id || allIds.has(id)) reject('INVALID_XML');
            allIds.add(id);
            if ([...OFFICE_NAMESPACES].some(ns => attr(node, 'Type') === `${ns}/hyperlink`) && attr(node, 'TargetMode') === 'External'
                && passiveTarget(attr(node, 'Target'))) ids.add(id);
        }, (item, _closeStart, end) => {
            if (item.node.uri === REL && item.node.local === 'Relationship' && ids.has(attr(item.node, 'Id'))) removals.push([item.start, end]);
        });
        if (!ids.size) continue;
        const sourceName = name.replace('/_rels/', '/').replace(/\.rels$/u, '');
        const source = entries.get(sourceName);
        if (!source) reject('BROKEN_PACKAGE_RELATIONSHIP');
        const tags = [];
        const body = scan(source.data, item => {
            const refs = Object.values(item.node.attributes).filter(a => OFFICE_NAMESPACES.has(a.uri) && ids.has(a.value));
            if (!refs.length) return;
            if (item.node.uri !== WORD || item.node.local !== 'hyperlink' || refs.some(a => a.local !== 'id')) reject('EXTERNAL_OR_ACTIVE_RELATIONSHIP');
            item.unwrap = true; tags.push([item.start, item.end]);
        }, (item, start, end) => { if (item.unwrap && !item.node.isSelfClosing) tags.push([start, end]); });
        entry.data = remove(xml, removals); entry.changed = true;
        source.data = remove(body, tags); source.changed = true; changed = true;
    }
    return changed ? writeZip(entries) : buffer;
}
module.exports = { normalizePassiveLinks };
