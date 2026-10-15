'use strict';
// Only deployment-owned configuration defaults are copied, never clients, case data, files or attachments.
// Kept separate from request-time lookups so another office's template cannot become a fallback.
async function seedOfficeDefaults(db,tenant) {
    const id=tenant.id;
    await db.query(`INSERT INTO email_templates(law_firm_tenant_id,template_key,label,subject_template,html_body,available_vars)
        SELECT $1,template_key,label,subject_template,html_body,available_vars FROM email_templates WHERE law_firm_tenant_id IS NULL
        ON CONFLICT(law_firm_tenant_id,template_key) DO NOTHING`,[id]);
    await db.query(`INSERT INTO notification_channel_config(law_firm_tenant_id,notification_type,label,push_enabled,email_enabled,sms_enabled,admin_cc,manager_cc)
        SELECT $1,notification_type,label,push_enabled,email_enabled,sms_enabled,admin_cc,manager_cc FROM notification_channel_config WHERE law_firm_tenant_id IS NULL
        ON CONFLICT(law_firm_tenant_id,notification_type) DO NOTHING`,[id]);
    await db.query(`INSERT INTO platform_settings(law_firm_tenant_id,category,setting_key,setting_value,value_type,label,description)
        SELECT $1,category,setting_key,setting_value,value_type,label,description FROM platform_settings
        WHERE law_firm_tenant_id IS NULL AND category IN ('calendar','signing','templates','managerHome')
        AND setting_key !~* '(secret|password|token|api.?key)'
        ON CONFLICT(law_firm_tenant_id,category,setting_key) DO NOTHING`,[id]);
    for(const [category,key,value] of [
        ['firm','LAW_FIRM_NAME',tenant.name],['firm','COMPANY_NAME',tenant.name],
        ['messaging','SMTP_FROM_NAME',tenant.name],['messaging','INFORU_SENDER_PHONE','MelaMedia'],
    ]) await db.query(`INSERT INTO platform_settings(law_firm_tenant_id,category,setting_key,setting_value)
        VALUES($1,$2,$3,$4) ON CONFLICT(law_firm_tenant_id,category,setting_key) DO NOTHING`,[id,category,key,value]);
}
module.exports={seedOfficeDefaults};
