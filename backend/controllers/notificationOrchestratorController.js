const { notifyRecipient } = require('../services/notifications/notificationOrchestrator');
const { WEBSITE_DOMAIN } = require('../utils/sendMessage');

function buildDefaultEmailContactFields(campaignKey) {
    const key = String(campaignKey || '').trim().toUpperCase();
    const baseUrl = `https://${WEBSITE_DOMAIN}`;

    switch (key) {
        case 'SIGN_INVITE':
        case 'SIGN_REMINDER':
            return {
                recipient_name: 'Test Recipient',
                document_name: 'מסמך בדיקה',
                action_url: `${baseUrl}/sign/test?token=demo`,
                lawyer_name: 'Test Lawyer',
            };
        case 'CASE_CREATED':
        case 'CASE_NAME_CHANGE':
        case 'CASE_TYPE_CHANGE':
        case 'CASE_STAGE_CHANGE':
        case 'CASE_CLOSED':
        case 'CASE_REOPENED':
        case 'CASE_MANAGER_CHANGE':
        case 'CASE_EST_DATE_CHANGE':
        case 'CASE_LICENSE_CHANGE':
        case 'CASE_COMPANY_CHANGE':
        case 'CASE_TAGGED':
            return {
                recipient_name: 'Test Recipient',
                case_title: 'תיק בדיקה',
                case_number: '1001',
                case_stage: 'שלב ראשוני',
                manager_name: 'Test Manager',
                action_url: baseUrl,
            };
        case 'DOC_SIGNED':
            return {
                recipient_name: 'Test Lawyer',
                document_name: 'מסמך בדיקה',
                lawyer_name: 'Test Lawyer',
                action_url: baseUrl,
            };
        case 'DOC_REJECTED':
            return {
                recipient_name: 'Test Lawyer',
                document_name: 'מסמך בדיקה',
                lawyer_name: 'Test Lawyer',
                rejection_reason: 'סיבת דחייה לדוגמה',
                action_url: baseUrl,
            };
        default:
            return { recipient_name: 'Test Recipient', action_url: baseUrl };
    }
}

function parsePositiveInt(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.floor(n);
}

exports.testNotifyOrchestrator = async (req, res) => {
    try {
        const recipientUserId = parsePositiveInt(req.body?.recipientUserId ?? req.body?.userId);
        if (!recipientUserId) {
            return res.status(422).json({ ok: false, errorCode: 'VALIDATION_ERROR', error: 'recipientUserId is required' });
        }

        const notificationType = String(req.body?.notificationType || 'SIGN_INVITE').trim();

        const campaignKey = String(req.body?.campaignKey || notificationType).trim().toUpperCase();

        const providedContactFields = req.body?.contactFields;
        const contactFields =
            providedContactFields && typeof providedContactFields === 'object' && !Array.isArray(providedContactFields)
                ? providedContactFields
                : buildDefaultEmailContactFields(campaignKey);

        const result = await notifyRecipient({
            recipientUserId,
            notificationType,
            push: {
                title: String(req.body?.pushTitle || 'Test Notification').trim(),
                body: String(req.body?.pushBody || 'This is a test notification').trim(),
                data: req.body?.pushData || { test: true },
            },
            email: {
                campaignKey,
                contactFields,
            },
            sms: {
                messageBody: String(req.body?.smsBody || `בדיקה: ${String(notificationType || '').trim()}\nhttps://${WEBSITE_DOMAIN}`).trim(),
            },
        });

        return res.json(result);
    } catch (e) {
        return res.status(500).json({ ok: false, errorCode: 'INTERNAL_ERROR', error: e?.message || 'Unknown error' });
    }
};
