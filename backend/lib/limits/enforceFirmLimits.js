const { getLimitsForFirm } = require('./getLimitsForFirm');
const { getUsageForFirm } = require('./getUsageForFirm');

function enforcementMode() {
    const mode = String(process.env.LIMITS_ENFORCEMENT_MODE || 'warn').toLowerCase();
    return (mode === 'block') ? 'block' : 'warn';
}

function quotaExceeded({ used, add, quota }) {
    if (quota === null || quota === undefined) return false;
    const q = Number(quota);
    if (!Number.isFinite(q) || q <= 0) return false;
    const u = Number(used || 0);
    const a = Number(add || 0);
    return (u + a) > q;
}

async function checkFirmLimitsOrNull({ firmId, action, increments }) {
    const limits = await getLimitsForFirm(firmId);
    const usage = await getUsageForFirm(firmId);
    if (!limits || !usage) return null;

    const quotas = limits.quotas || {};

    const warnings = [];
    const blocks = [];

    if (action === 'upload_signing_file') {
        if (quotaExceeded({ used: usage.documents.createdThisMonth, add: increments?.documentsCreatedThisMonth || 0, quota: quotas.documentsMonthlyQuota })) {
            const msg = 'Documents monthly quota exceeded';
            warnings.push(msg);
            blocks.push(msg);
        }

        const storageBytes = Number(usage.storage.bytesTotal || 0);
        const addBytes = Number(increments?.storageBytesTotal || 0);
        const storageGbQuota = quotas.storageGbQuota;
        if (storageGbQuota !== null && storageGbQuota !== undefined) {
            const qGb = Number(storageGbQuota);
            if (Number.isFinite(qGb) && qGb > 0) {
                const qBytes = qGb * 1024 * 1024 * 1024;
                if ((storageBytes + addBytes) > qBytes) {
                    const msg = 'Storage quota exceeded';
                    warnings.push(msg);
                    blocks.push(msg);
                }
            }
        }

        if (quotaExceeded({ used: usage.seats.used, add: 0, quota: quotas.usersQuota })) {
            const msg = 'Users/seats quota exceeded';
            warnings.push(msg);
            // seats typically shouldn’t block uploads automatically, but keep as warning for now.
        }
    }

    if (action === 'send_otp_sms') {
        if (quotaExceeded({ used: usage.otp.smsThisMonth, add: increments?.otpSmsThisMonth || 0, quota: quotas.otpSmsMonthlyQuota })) {
            const msg = 'OTP SMS monthly quota exceeded';
            warnings.push(msg);
            blocks.push(msg);
        }
    }

    if (action === 'generate_evidence') {
        if (quotaExceeded({ used: usage.evidence.generationsThisMonth, add: increments?.evidenceGenerationsThisMonth || 0, quota: quotas.evidenceGenerationsMonthlyQuota })) {
            const msg = 'Evidence generations monthly quota exceeded';
            warnings.push(msg);
            blocks.push(msg);
        }

        if (quotaExceeded({ used: usage.evidence.cpuSecondsThisMonth, add: increments?.evidenceCpuSecondsThisMonth || 0, quota: quotas.evidenceCpuSecondsMonthlyQuota })) {
            const msg = 'Evidence CPU seconds monthly quota exceeded';
            warnings.push(msg);
            blocks.push(msg);
        }
    }

    return {
        enforcementMode: enforcementMode(),
        limits,
        usage,
        warnings,
        blocks,
    };
}

module.exports = {
    enforcementMode,
    checkFirmLimitsOrNull,
};
