/** QA-only transport suppression; never log recipients, content, or codes. */
function qaOutboundNoop(channel) {
    const mode = process.env.QA_OUTBOUND_MODE;
    if (!mode) return null;
    if (mode !== 'noop' || process.env.DB_NAME !== 'melamedia' || process.env.PORT !== '3003' || process.env.DATABASE_URL) {
        throw new Error('QA outbound mode requires the isolated Melamedia QA database and port');
    }
    if (!['sms', 'email', 'push'].includes(channel)) throw new Error('Unknown outbound channel');
    console.info(JSON.stringify({ event: 'qa_outbound_suppressed', channel }));
    return { ok: true, simulated: true, suppressed: true, mode: 'qa-noop' };
}
module.exports = { qaOutboundNoop };
