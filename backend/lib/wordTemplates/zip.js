'use strict';

const zlib = require('node:zlib');
const { reject } = require('./errors');

// Deliberately bounded ZIP32 subset. Never extract files to the filesystem.
const LIMITS = Object.freeze({ archiveBytes: 20 * 1024 * 1024, entries: 1024,
    entryBytes: 12 * 1024 * 1024, totalBytes: 50 * 1024 * 1024, ratio: 200 });
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k += 1) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
});
function crc32(data) {
    let n = 0xffffffff;
    for (const byte of data) n = CRC_TABLE[(n ^ byte) & 255] ^ (n >>> 8);
    return (n ^ 0xffffffff) >>> 0;
}
function nameOf(bytes) {
    const name = bytes.toString('utf8');
    if (bytes.length > 512 || !Buffer.from(name).equals(bytes) || /[\0\\\u0001-\u001f]/u.test(name)
        || name.startsWith('/') || /^[A-Za-z]:/u.test(name)
        || name.split('/').some(p => p === '.' || p === '..') || name.includes('//')) reject('UNSAFE_ZIP_PATH');
    return name;
}
function readZip(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer.length > LIMITS.archiveBytes) reject('DOCX_SIZE_LIMIT');
    let end = -1;
    for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i -= 1) {
        if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) { end = i; break; }
    }
    if (end < 0) reject('INVALID_ZIP');
    const count = buffer.readUInt16LE(end + 10);
    const size = buffer.readUInt32LE(end + 12);
    const offset = buffer.readUInt32LE(end + 16);
    if (buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6)
        || count !== buffer.readUInt16LE(end + 8) || count === 65535 || count > LIMITS.entries
        || offset === 0xffffffff || size === 0xffffffff || offset + size !== end) reject('UNSUPPORTED_ZIP');
    const entries = new Map();
    const ranges = [];
    let cursor = offset;
    let total = 0;
    for (let i = 0; i < count; i += 1) {
        if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) reject('INVALID_ZIP');
        const flags = buffer.readUInt16LE(cursor + 8);
        const method = buffer.readUInt16LE(cursor + 10);
        const crc = buffer.readUInt32LE(cursor + 16);
        const compressedSize = buffer.readUInt32LE(cursor + 20);
        const expandedSize = buffer.readUInt32LE(cursor + 24);
        const nameLength = buffer.readUInt16LE(cursor + 28);
        const extraLength = buffer.readUInt16LE(cursor + 30);
        const commentLength = buffer.readUInt16LE(cursor + 32);
        const local = buffer.readUInt32LE(cursor + 42);
        const next = cursor + 46 + nameLength + extraLength + commentLength;
        if (next > end || buffer.readUInt16LE(cursor + 34) || flags & ~0x080e
            || flags & 1 || ![0, 8].includes(method) || local === 0xffffffff
            || ((buffer.readUInt32LE(cursor + 38) >>> 16) & 0xf000) === 0xa000) reject('UNSUPPORTED_ZIP');
        const nameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
        const name = nameOf(nameBytes);
        if (!name || entries.has(name) || entries.has(name.toLowerCase())
            || [...entries.keys()].some(k => k.toLowerCase() === name.toLowerCase())) reject('DUPLICATE_ZIP_PART');
        total += expandedSize;
        if (expandedSize > LIMITS.entryBytes || total > LIMITS.totalBytes
            || expandedSize > Math.max(1024, compressedSize * LIMITS.ratio)) reject('ZIP_EXPANSION_LIMIT');
        if (local + 30 > offset || buffer.readUInt32LE(local) !== 0x04034b50
            || buffer.readUInt16LE(local + 6) !== flags || buffer.readUInt16LE(local + 8) !== method) reject('INVALID_ZIP');
        const localNameLength = buffer.readUInt16LE(local + 26);
        const start = local + 30 + localNameLength + buffer.readUInt16LE(local + 28);
        const finish = start + compressedSize;
        if (!nameBytes.equals(buffer.subarray(local + 30, local + 30 + localNameLength)) || finish > offset
            || (!(flags & 8) && (buffer.readUInt32LE(local + 14) !== crc
                || buffer.readUInt32LE(local + 18) !== compressedSize || buffer.readUInt32LE(local + 22) !== expandedSize))) reject('INVALID_ZIP');
        ranges.push([local, finish]);
        const compressed = buffer.subarray(start, finish);
        let data;
        try { data = method === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed, { maxOutputLength: LIMITS.entryBytes }); }
        catch (_) { reject('INVALID_OR_OVERSIZED_ZIP_DATA'); }
        if (data.length !== expandedSize || crc32(data) !== crc) reject('ZIP_INTEGRITY_FAILED');
        entries.set(name, { name, data, compressed, method, crc,
            time: buffer.readUInt16LE(cursor + 12), date: buffer.readUInt16LE(cursor + 14) });
        cursor = next;
    }
    if (cursor !== end) reject('INVALID_ZIP');
    ranges.sort((a, b) => a[0] - b[0]);
    if (ranges.some((r, i) => i && r[0] < ranges[i - 1][1])) reject('OVERLAPPING_ZIP_ENTRIES');
    return entries;
}

function writeZip(entries) {
    const bodies = [];
    const central = [];
    let offset = 0;
    let total = 0;
    for (const entry of entries.values()) {
        const name = Buffer.from(entry.name);
        const data = entry.data;
        total += data.length;
        if (data.length > LIMITS.entryBytes || total > LIMITS.totalBytes) reject('DOCX_SIZE_LIMIT');
        let compressed = entry.changed ? zlib.deflateRawSync(data) : entry.compressed;
        let method = entry.changed ? 8 : entry.method;
        // Repetitive merged values must not produce an archive our own ratio
        // guard refuses. Store that changed part instead, within size limits.
        if (entry.changed && data.length > Math.max(1024, compressed.length * LIMITS.ratio)) { compressed = data; method = 0; }
        const crc = entry.changed ? crc32(data) : entry.crc;
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
        local.writeUInt16LE(method, 8); local.writeUInt16LE(entry.time || 0, 10); local.writeUInt16LE(entry.date || 0, 12);
        local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
        const record = Buffer.alloc(46);
        record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x800, 8);
        record.writeUInt16LE(method, 10); record.writeUInt16LE(entry.time || 0, 12); record.writeUInt16LE(entry.date || 0, 14);
        record.writeUInt32LE(crc, 16); record.writeUInt32LE(compressed.length, 20); record.writeUInt32LE(data.length, 24);
        record.writeUInt16LE(name.length, 28); record.writeUInt32LE(offset, 42);
        bodies.push(local, name, compressed); central.push(record, name);
        offset += local.length + name.length + compressed.length;
    }
    const directory = Buffer.concat(central);
    const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.size, 8); end.writeUInt16LE(entries.size, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
    const output = Buffer.concat([...bodies, directory, end]);
    if (output.length > LIMITS.archiveBytes) reject('DOCX_SIZE_LIMIT');
    return output;
}
module.exports = { readZip, writeZip, crc32, LIMITS };
