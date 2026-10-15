const { expect } = require('./errors');

// Preserve typed values exactly, including leading zeroes. Never substitute a
// signer's delivery contact: document values need their own explicit entry.
function validateSignerFieldValue(type, value, path) {
    if (!value) return;
    if (type === 'email') expect(value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'INVALID_VALUES', path);
    if (type === 'phone') expect(/^\+?[0-9]{7,15}$/.test(value), 'INVALID_VALUES', path);
    if (type === 'idnumber') expect(/^[0-9]{1,40}$/.test(value), 'INVALID_VALUES', path);
}
module.exports = { validateSignerFieldValue };
