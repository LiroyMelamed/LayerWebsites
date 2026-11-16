/** Provider acceptance is not proof of delivery to the recipient's device. */
function invitationDelivery(row) {
    const receipts = Array.isArray(row.reminders_sent_offsets) ? row.reminders_sent_offsets : [];
    const channels = ['sms', 'email'].filter(channel => receipts.some(key => new RegExp(`^invite:[a-f0-9]+:${channel}$`).test(String(key))));
    const uncertain = receipts.some(key => /^invite-claim:/.test(String(key)));
    return {
        status: uncertain ? 'uncertain' : row.invite_deferred_until ? 'deferred' : channels.length ? 'sent' : 'unsent',
        channels,
        deferredUntil: row.invite_deferred_until || null,
    };
}
module.exports = { invitationDelivery };
