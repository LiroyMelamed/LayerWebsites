'use strict';

const emailPattern = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

/** When mail is sent from noreply@domain, replies belong at office@domain. */
function defaultOfficeReplyTo(fromEmail) {
    const from = String(fromEmail || '').trim();
    const at = from.lastIndexOf('@');
    if (at <= 0 || at === from.length - 1) return '';
    const local = from.slice(0, at).toLowerCase();
    const domain = from.slice(at + 1);
    const office = `office@${domain}`;
    if (!emailPattern.test(office)) return '';
    if (local === 'noreply' || local === 'no-reply' || local.startsWith('noreply')) {
        return office;
    }
    return '';
}

function resolveInviteReplyAddress(explicit, fromEmail) {
    const chosen = String(explicit || '').trim();
    if (emailPattern.test(chosen)) return chosen;
    return defaultOfficeReplyTo(fromEmail);
}

module.exports = { defaultOfficeReplyTo, resolveInviteReplyAddress };
