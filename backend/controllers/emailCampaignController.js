const { sendEmailCampaign } = require('../utils/smooveEmailCampaignService');

const testSendEmailCampaign = async (req, res, next) => {
    try {
        const toEmail = String(req?.body?.toEmail || '').trim();
        const campaignKey = String(req?.body?.campaignKey || '').trim();

        const result = await sendEmailCampaign({
            toEmail,
            campaignKey,
            contactFields: {
                client_name: 'Test Client',
                case_number: 'CASE-12345',
                case_title: 'תיק בדיקה',
                action_url: 'https://client.melamedlaw.co.il/sign/test?token=demo',
                lawyer_name: 'Test Lawyer',
            },
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
