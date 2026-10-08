const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { bytesHash } = require('../../lib/signingV2/canonical');

// Synthetic private disk storage shared by the parent and killed worker process.
module.exports = directory => {
    const file = key => path.join(directory, bytesHash(Buffer.from(key)) + '.pdf');
    return {
        read: key => fs.readFile(file(key)),
        write: (key, bytes) => fs.writeFile(file(key), bytes),
        verify: async (key, length, hash) => {
            const bytes = await fs.readFile(file(key));
            assert.equal(bytes.length, length);
            assert.equal(bytesHash(bytes), hash);
        },
    };
};
