const { sendEmailCampaign } = require('../utils/smooveEmailCampaignService');

function buildDefaultContactFieldsForCampaignKey(campaignKey) {
    const key = String(campaignKey || '').trim().toUpperCase();
    const baseActionUrl = 'https://client.melamedlaw.co.il';

    switch (key) {
        case 'SIGN_INVITE':
        case 'SIGN_REMINDER':
            return {
                recipient_name: 'Test Client',
                document_name: 'מסמך בדיקה',
                action_url: `${baseActionUrl}/sign/test?token=demo`,
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
                recipient_name: 'Test Client',
                case_title: 'תיק בדיקה',
                case_number: '1001',
                case_stage: 'שלב ראשוני',
                manager_name: 'Test Manager',
                action_url: baseActionUrl,
            };
        case 'DOC_SIGNED':
            return {
                recipient_name: 'Test Lawyer',
                document_name: 'מסמך בדיקה',
                lawyer_name: 'Test Lawyer',
                action_url: baseActionUrl,
            };
        case 'DOC_REJECTED':
            return {
                recipient_name: 'Test Lawyer',
                document_name: 'מסמך בדיקה',
                lawyer_name: 'Test Lawyer',
                rejection_reason: 'סיבת דחייה לדוגמה',
                action_url: baseActionUrl,
            };
        default:
            return {
                recipient_name: 'Test Recipient',
                action_url: baseActionUrl,
            };
    }
}

const testSendEmailCampaign = async (req, res, next) => {
    try {
        const toEmail = String(req?.body?.toEmail || '').trim();
        const campaignKey = String(req?.body?.campaignKey || '').trim();

        const providedContactFields = req?.body?.contactFields;
        const contactFields =
            providedContactFields && typeof providedContactFields === 'object' && !Array.isArray(providedContactFields)
                ? providedContactFields
                : buildDefaultContactFieldsForCampaignKey(campaignKey);

        const result = await sendEmailCampaign({
            toEmail,
            campaignKey,
            contactFields,
        });

        if (!result?.ok) {
            return res.status(400).json({ ok: false, ...result });
        }

        return res.status(200).json({ ok: true, ...result });
    } catch (e) {
        return next(e);
    }
};

module.exports = { testSendEmailCampaign };
