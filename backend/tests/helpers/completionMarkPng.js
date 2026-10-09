const zlib = require('node:zlib');
module.exports = function completionMarkPng(color = 0xB82222FF) {
    const width = 240, height = 80, rows = [];
    for (let y = 0; y < height; y++) {
        const row = Buffer.alloc(1 + width * 4);
        for (let x = 0; x < width; x++) row.writeUInt32BE(y > 30 && y < 45 && x > 10 && x < 225 ? color : 0, 1 + x * 4);
        rows.push(row);
    }
    const chunk = (type, data) => {
        const body = Buffer.concat([Buffer.from(type), data]), length = Buffer.alloc(4), crc = Buffer.alloc(4);
        length.writeUInt32BE(data.length); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
        return Buffer.concat([length, body, crc]);
    };
    const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
};
