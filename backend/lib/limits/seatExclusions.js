function parseHiddenAdminIds() {
    const raw = String(process.env.HIDDEN_ADMIN_USER_IDS || '').trim();
    if (!raw) return [];
    return raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
}

function nationalLast9(phone) {
    let digits = String(phone || '').replace(/\D/g, '');
    if (digits.startsWith('972')) digits = digits.slice(3);
    if (digits.startsWith('0')) digits = digits.slice(1);
    return digits.slice(-9);
}

function excludedSeatPhones() {
    const raw = String(process.env.USAGE_EXCLUDED_PHONES || '0507299064').trim();
    const list = raw
        .split(',')
        .map((s) => nationalLast9(s))
        .filter((s) => s.length >= 8);
    if (!list.includes('507299064')) list.push('507299064');
    return [...new Set(list)];
}

module.exports = {
    parseHiddenAdminIds,
    nationalLast9,
    excludedSeatPhones,
};
