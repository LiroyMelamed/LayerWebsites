'use strict';
const {caseScopeFilter}=require('./firmPermissions/caseScope');
const {getCurrentTenantId}=require('./tenant/tenantContext');
const {hasAreaAction}=require('./firmRolePermissions');
function listing(req,first=1){
    const mode=req.firmPermissionMode || 'legacy';
    if(mode==='role' && !hasAreaAction(req.firmPermissions,'cases','view'))return null;
    if(!['Admin','Lawyer','Staff'].includes(req.user?.Role))return null;
    const scoped=caseScopeFilter(req,'c',first+1);
    const params=[getCurrentTenantId(),...(scoped?.params || [])];
    let permission=scoped?.sql || 'TRUE';
    if(!scoped && req.user.Role!=='Admin' && mode!=='platform_admin'){
        params.push(req.user.UserId);permission=`(c.casemanagerid=$${first+1} OR EXISTS(SELECT 1 FROM case_users cu WHERE cu.caseid=c.caseid AND cu.userid=$${first+1}))`;
    }
    return {params,sql:`SELECT ('doc-'||d.id)::text AS id,d.user_id,u.name AS client_name,
        CASE d.channel WHEN 'email' THEN u.email WHEN 'sms' THEN u.phonenumber ELSE u.name END AS to_email,
        (c.casename||' — '||r.stage_title)::text AS subject,'DOCUMENT_REQUEST'::text AS template_key,d.scheduled_for,
        d.status,d.error,d.created_at,d.sent_at,d.cancelled_at,NULL::integer AS calendar_event_id,
        'document_request'::text AS source,NULL::text AS audience,jsonb_build_array(d.channel) AS channels,NULL::timestamptz AS event_start_time
        FROM case_document_deliveries d JOIN case_document_requests r ON r.id=d.request_id JOIN cases c ON c.caseid=r.case_id
        LEFT JOIN users u ON u.userid=d.user_id WHERE r.law_firm_tenant_id IS NOT DISTINCT FROM $${first}::uuid AND ${permission}`};
}
module.exports={listing};
