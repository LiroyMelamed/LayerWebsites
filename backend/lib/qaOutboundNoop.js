/** QA-only transport suppression; never log recipients, content, or codes. */
function endpointAllowed(endpoint) {
    const allow = String(process.env.QA_OUTBOUND_ALLOW || '').split(',').map(item => item.trim()).filter(Boolean);
    if (!allow.length || endpoint == null || String(endpoint).trim() === '') return false;
    const raw = String(endpoint).trim().toLowerCase();
    const digits = raw.replace(/\D/g, '');
    return allow.some(item => {
        const candidate = item.toLowerCase();
        if (candidate.includes('@')) return candidate === raw;
        const candidateDigits = candidate.replace(/\D/g, '');
        const tail = value => value.slice(-9);
        return Boolean(digits && candidateDigits && tail(digits) === tail(candidateDigits));
    });
}

function qaOutboundNoop(channel, endpoint) {
    const mode = process.env.QA_OUTBOUND_MODE;
    if (!mode) return null;
    if (mode !== 'noop' || process.env.DB_NAME !== 'melamedia' || process.env.PORT !== '3003' || process.env.DATABASE_URL) {
        throw new Error('QA outbound mode requires the isolated Melamedia QA database and port');
    }
    if (!['sms', 'email', 'push'].includes(channel)) throw new Error('Unknown outbound channel');
    if (endpointAllowed(endpoint)) return null;
    console.info(JSON.stringify({ event: 'qa_outbound_suppressed', channel }));
    return { ok: true, simulated: true, suppressed: true, mode: 'qa-noop' };
}
module.exports = { qaOutboundNoop };
