'use strict';
const { randomUUID } = require('node:crypto');
const { transaction } = require('./signingV2/transaction');
const { createAppError } = require('../utils/appError');
const { getCurrentTenantId } = require('../lib/tenant/tenantContext');
const { hasAreaAction, normalizeRolePermissions, getCasesDataScope } = require('../lib/firmRolePermissions');
const fail = (code, status = 400) => { throw createAppError(code, status); };
const channels = ['email','sms','push'];
function defaults(value = {}) {
    if (!value || !Array.isArray(value.items) || value.items.length > 40 || typeof value.sendOnEntry !== 'boolean') fail('INVALID_DOCUMENT_DEFAULTS');
    return { items: value.items.map(label => {
        if (typeof label !== 'string' || !label.trim() || label.trim().length > 120 || /[\x00-\x1f]/.test(label)) fail('INVALID_DOCUMENT_TITLE');
        return label.trim();
    }), sendOnEntry: value.sendOnEntry };
}
function missing(row) { return row.items.filter(item => item.status === 'missing'); }
async function policy() {
    const { getSetting } = require('./settingsService');
    const get = (key, fallback) => getSetting('reminders', `DOCUMENT_REQUEST_${key}`, fallback);
    const hours = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 2160 ? Number(value) : 72;
    const available = String(await get('CHANNELS','email,sms')).split(',').filter(value => channels.includes(value));
    return { enabled: ['true','1'].includes(String(await get('AUTO_ENABLED','false'))),
        firstHours: hours(await get('FIRST_HOURS',72)), repeatHours: hours(await get('REPEAT_HOURS',72)), available,
        defaults: String(await get('DEFAULT_CHANNELS','email,sms')).split(',').filter(value => available.includes(value)) };
}
async function audit(db, row, actor, action, detail = {}) {
    await db.query('INSERT INTO case_document_request_events(law_firm_tenant_id,request_id,actor_id,action,detail) VALUES($1,$2,$3,$4,$5)',
        [row.law_firm_tenant_id,row.id,actor,action,JSON.stringify(detail)]);
}
async function caseRow(db, id, lock = false) {
    const row = (await db.query(`SELECT * FROM cases WHERE caseid=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid ${lock ? 'FOR UPDATE' : ''}`, [id,getCurrentTenantId()])).rows[0];
    if (!row) fail('NOT_FOUND',404); return row;
}
async function requestRow(db, caseId, id) {
    const row = (await db.query('SELECT * FROM case_document_requests WHERE case_id=$1 AND id=$2 AND law_firm_tenant_id IS NOT DISTINCT FROM $3::uuid FOR UPDATE', [caseId,id,getCurrentTenantId()])).rows[0];
    if (!row) fail('NOT_FOUND',404); return row;
}
async function initialize(db, record, actor) {
    const descriptions = (await db.query(`SELECT d.descriptionid,d.text,d.stage,td.document_request_defaults AS config FROM casedescriptions d
        LEFT JOIN casetypedescriptions td ON td.casetypeid=$2 AND td.stage=d.stage WHERE d.caseid=$1 ORDER BY d.stage`, [record.caseid,record.casetypeid])).rows;
    const settings = await policy();
    for (const description of descriptions) {
        const config = defaults(description.config || {items:[],sendOnEntry:false});
        if (!config.items.length) continue;
        const active = !record.isclosed && Number(record.currentstage) === Number(description.stage) && config.sendOnEntry;
        const result = await db.query(`INSERT INTO case_document_requests(id,law_firm_tenant_id,case_id,description_id,stage_title,items,channels,created_by,state,next_due,automatic,send_on_entry,manual_pending)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,CASE WHEN $10 THEN now() ELSE NULL END,$11,$12,$10) ON CONFLICT(description_id) DO NOTHING RETURNING *`,
        [randomUUID(),getCurrentTenantId(),record.caseid,description.descriptionid,description.text,
            JSON.stringify(config.items.map(title=>({id:randomUUID(),title,status:'missing'}))),JSON.stringify(settings.defaults),actor,active?'active':'draft',active,settings.enabled,config.sendOnEntry]);
        if (result.rows[0]) await audit(db,result.rows[0],actor,'created');
    }
}
async function list(db, caseId, {client = false} = {}) {
    await caseRow(db,caseId);
    const requests = (await db.query('SELECT * FROM case_document_requests WHERE case_id=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid ORDER BY created_at,id',[caseId,getCurrentTenantId()])).rows;
    if (client) return { requests: requests.map(row=>({id:row.id,description_id:row.description_id,stage_title:row.stage_title,items:row.items.map(({id,title,status})=>({id,title,status}))})) };
    if (requests.length) {
        const byId = new Map(requests.map(row => {
            row.history = [];
            row.deliveries = [];
            return [row.id, row];
        }));
        const ids = requests.map(row => row.id);
        const history = await db.query(`SELECT recent.* FROM unnest($1::uuid[]) AS r(id)
            CROSS JOIN LATERAL (SELECT e.*,u.name AS actor_name FROM case_document_request_events e
                LEFT JOIN users u ON u.userid=e.actor_id WHERE e.request_id=r.id ORDER BY e.id DESC LIMIT 40) recent
            ORDER BY recent.request_id,recent.id DESC`, [ids]);
        const deliveries = await db.query(`SELECT recent.* FROM unnest($1::uuid[]) AS r(id)
            CROSS JOIN LATERAL (SELECT d.*,u.name AS client_name FROM case_document_deliveries d
                LEFT JOIN users u ON u.userid=d.user_id WHERE d.request_id=r.id ORDER BY d.created_at DESC,d.id DESC LIMIT 80) recent
            ORDER BY recent.request_id,recent.created_at DESC,recent.id DESC`, [ids]);
        for (const event of history.rows) byId.get(event.request_id).history.push(event);
        for (const delivery of deliveries.rows) byId.get(delivery.request_id).deliveries.push(delivery);
    }
    return { requests, policy: await policy() };
}
async function save(pool, actor, caseId, body) {
    if (!body || !Number.isSafeInteger(Number(body.descriptionId)) || Number(body.descriptionId)<=0) fail('INVALID_DOCUMENT_ITEMS');
    return transaction(pool, async db => {
        const record = await caseRow(db,caseId,true);
        const stage = (await db.query('SELECT * FROM casedescriptions WHERE caseid=$1 AND descriptionid=$2',[caseId,body.descriptionId])).rows[0];
        if (!stage) fail('NOT_FOUND',404);
        let row = (await db.query('SELECT * FROM case_document_requests WHERE case_id=$1 AND description_id=$2 FOR UPDATE',[caseId,stage.descriptionid])).rows[0];
        if (row && Number(body.version)!==row.version) fail('DOCUMENT_REQUEST_CHANGED',409);
        if (!Array.isArray(body.items) || body.items.length>40) fail('INVALID_DOCUMENT_ITEMS');
        const ids = new Set();
        const files=new Set((await db.query('SELECT id FROM stage_files WHERE caseid=$1 AND stage=$2',[caseId,stage.stage])).rows.map(file=>file.id));
        const items = body.items.map(item=>{
            if (!item || typeof item!=='object' || Array.isArray(item)) fail('INVALID_DOCUMENT_ITEMS');
            const title=defaults({items:[item.title],sendOnEntry:false}).items[0];
            if (!['missing','received','not_required'].includes(item.status)) fail('INVALID_DOCUMENT_STATUS');
            const old=row?.items.find(old=>old.id===item.id);
            if (item.id && !old || ids.has(item.id)) fail('INVALID_DOCUMENT_ITEM');
            if (item.id) ids.add(item.id);
            if(item.fileId!=null && !files.has(Number(item.fileId)))fail('INVALID_DOCUMENT_FILE');
            return {...old,fileId:item.fileId==null?null:Number(item.fileId),id:old?.id || randomUUID(),title,status:item.status,
                ...(old?.status!==item.status ? {updatedBy:actor,updatedAt:new Date().toISOString()} : {})};
        });
        const settings=await policy();
        if (!row) row=(await db.query(`INSERT INTO case_document_requests(id,law_firm_tenant_id,case_id,description_id,stage_title,items,channels,created_by)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[randomUUID(),getCurrentTenantId(),caseId,stage.descriptionid,stage.text,JSON.stringify(items),JSON.stringify(settings.defaults),actor])).rows[0];
        else {
            const state=items.some(item=>item.status==='missing') ? (row.state==='completed'?'paused':row.state) : 'completed';
            row=(await db.query(`UPDATE case_document_requests SET items=$2,state=$3,version=version+1,updated_at=now(),next_due=CASE WHEN $3='active' THEN next_due ELSE NULL END WHERE id=$1 RETURNING *`,[row.id,JSON.stringify(items),state])).rows[0];
            if (state!=='active') await cancelPending(db,row.id);
        }
        await audit(db,row,actor,'checklist_updated',{items});
        return row;
    });
}
async function cancelPending(db,id) {
    await db.query("UPDATE case_document_deliveries SET status='CANCELLED',cancelled_at=now() WHERE request_id=$1 AND status='PENDING'",[id]);
}
async function action(pool,actor,caseId,id,body) {
    return transaction(pool,async db=>{
        const record=await caseRow(db,caseId,true); const row=await requestRow(db,caseId,id);
        if (Number(body.version)!==row.version) fail('DOCUMENT_REQUEST_CHANGED',409);
        if (body.action==='cancel') {
            await db.query("UPDATE case_document_requests SET state='cancelled',next_due=NULL,version=version+1 WHERE id=$1",[id]);
            await cancelPending(db,id); await audit(db,row,actor,'cancelled'); return;
        }
        if (!['send','retry'].includes(body.action)) fail('INVALID_ACTION');
        const stage=(await db.query('SELECT stage FROM casedescriptions WHERE descriptionid=$1',[row.description_id])).rows[0];
        if (record.isclosed || !stage || Number(stage.stage)!==Number(record.currentstage)) fail('DOCUMENT_STAGE_INACTIVE',409);
        if (!missing(row).length) fail('DOCUMENTS_COMPLETE',409);
        if ((await db.query("SELECT 1 FROM case_document_deliveries WHERE request_id=$1 AND status IN ('PENDING','SENDING') LIMIT 1",[id])).rows.length) fail('DOCUMENT_SEND_PENDING',409);
        if (row.state==='active' && row.next_due && !row.first_sent_at) fail('DOCUMENT_SEND_PENDING',409);
        if (body.action==='retry') {
            const previous=(await db.query('SELECT * FROM case_document_deliveries WHERE id=$1 AND request_id=$2 FOR UPDATE',[body.deliveryId,id])).rows[0];
            if (!previous || !['FAILED','UNKNOWN'].includes(previous.status)) fail('DOCUMENT_RETRY_UNAVAILABLE',409);
            if (previous.status==='UNKNOWN' && body.confirmUnknown!==true) fail('DOCUMENT_DELIVERY_UNKNOWN',409);
            if ((await db.query("SELECT 1 FROM case_document_request_events WHERE request_id=$1 AND action='retry_requested' AND detail->>'deliveryId'=$2",[id,previous.id])).rows.length) fail('DOCUMENT_RETRY_UNAVAILABLE',409);
            const settings=await policy();
            if (!settings.available.includes(previous.channel)) fail('INVALID_DOCUMENT_CHANNELS');
            await db.query("UPDATE case_document_requests SET state='active',next_due=NULL,manual_pending=false,automatic=false,created_by=$2,cycle=cycle+1,version=version+1 WHERE id=$1",[id,actor]);
            await db.query('INSERT INTO case_document_deliveries(id,law_firm_tenant_id,request_id,cycle,user_id,channel,manual) VALUES($1,$2,$3,$4,$5,$6,true)',[randomUUID(),row.law_firm_tenant_id,id,row.cycle+1,previous.user_id,previous.channel]);
            await audit(db,row,actor,'retry_requested',{deliveryId:previous.id}); return;
        }
        if ((await db.query("SELECT 1 FROM case_document_deliveries WHERE request_id=$1 AND status='UNKNOWN' LIMIT 1",[id])).rows.length && body.confirmUnknown!==true) fail('DOCUMENT_DELIVERY_UNKNOWN',409);
        const settings=await policy(); const selected=[...new Set(body.channels || [])];
        if (!selected.length || selected.some(channel=>!settings.available.includes(channel))) fail('INVALID_DOCUMENT_CHANNELS');
        await db.query(`UPDATE case_document_requests SET state='active',channels=$2,created_by=$3,next_due=now(),automatic=$4,manual_pending=true,cycle=cycle+1,version=version+1,updated_at=now() WHERE id=$1`,[id,JSON.stringify(selected),actor,settings.enabled]);
        await audit(db,row,actor,'send_requested',{channels:selected});
    });
}
// Called inside the case update transaction, before changing the stage. Retained
// lists never become active merely because somebody returns to an earlier stage.
async function beforeTransition(db,record,nextStage,nextClosed,confirmed) {
    if (Number(record.currentstage)===Number(nextStage ?? record.currentstage) && !nextClosed) return;
    const rows=(await db.query(`SELECT r.* FROM case_document_requests r JOIN casedescriptions d ON d.descriptionid=r.description_id
        WHERE r.case_id=$1 AND d.stage=$2 FOR UPDATE OF r`,[record.caseid,record.currentstage])).rows;
    if (!confirmed && rows.some(row=>missing(row).length)) fail('DOCUMENTS_MISSING_CONFIRM',409);
    for (const row of rows) {
        await db.query("UPDATE case_document_requests SET state=CASE WHEN state='completed' THEN state ELSE 'paused' END,next_due=NULL,version=version+1 WHERE id=$1",[row.id]);
        await cancelPending(db,row.id); await audit(db,row,null,'stage_left');
    }
}
async function authorizedCreator(db,row,record) {
    const user=(await db.query('SELECT role,firm_staff_role_id,law_firm_tenant_id FROM users WHERE userid=$1',[row.created_by])).rows[0];
    if (!user || !['Admin','Lawyer','Staff'].includes(user.role) || String(user.law_firm_tenant_id||'')!==String(row.law_firm_tenant_id||'')) return false;
    if (!user.firm_staff_role_id) return user.role==='Admin';
    const role=(await db.query('SELECT * FROM firm_staff_roles WHERE id=$1',[user.firm_staff_role_id])).rows[0];
    if (!role?.is_active || String(role.law_firm_tenant_id||'')!==String(row.law_firm_tenant_id||'')) return false;
    const permissions=normalizeRolePermissions(role.permissions);
    if (!hasAreaAction(permissions,'cases','view') || !hasAreaAction(permissions,'cases','edit')) return false;
    return getCasesDataScope(permissions)==='all_firm' || record.casemanagerid===row.created_by ||
        (await db.query('SELECT 1 FROM case_users WHERE caseid=$1 AND userid=$2',[record.caseid,row.created_by])).rows.length>0;
}
async function active(db,row,record) {
    const stage=(await db.query('SELECT stage FROM casedescriptions WHERE descriptionid=$1',[row.description_id])).rows[0];
    return !record.isclosed && stage && Number(stage.stage)===Number(record.currentstage) && row.state==='active' && missing(row).length && await authorizedCreator(db,row,record);
}
async function processDue(pool,{notify, now = new Date()} = {}) {
    const settings=await policy();
    // An abandoned provider call is ambiguous. Never retry it automatically.
    await pool.query("UPDATE case_document_deliveries SET status='UNKNOWN',error='DELIVERY_UNCONFIRMED' WHERE status='SENDING' AND claimed_at < now()-interval '10 minutes'");
    const due=(await pool.query("SELECT id,case_id FROM case_document_requests WHERE state='active' AND next_due<=$1 ORDER BY next_due LIMIT 30",[now])).rows;
    for (const candidate of due) await transaction(pool,async db=>{
        const record=await caseRow(db,candidate.case_id,true); const row=await requestRow(db,candidate.case_id,candidate.id);
        if (!row.next_due || new Date(row.next_due)>now || row.state!=='active') return;
        if (!await active(db,row,record) || (!row.manual_pending && (!row.automatic || !settings.enabled))) {
            await db.query("UPDATE case_document_requests SET state='paused',next_due=NULL WHERE id=$1",[row.id]); return;
        }
        const recipients=(await db.query(`SELECT u.userid FROM case_users cu JOIN users u ON u.userid=cu.userid
            WHERE cu.caseid=$1 AND u.role IN ('User','Client') AND u.law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid`,[row.case_id,row.law_firm_tenant_id])).rows;
        if (!recipients.length || !row.channels.some(channel=>settings.available.includes(channel))) {
            await db.query("UPDATE case_document_requests SET state='paused',next_due=NULL WHERE id=$1",[row.id]);
            await audit(db,row,null,'send_blocked',{reason:recipients.length?'NO_CHANNELS':'NO_RECIPIENTS'}); return;
        }
        await db.query(`INSERT INTO case_document_deliveries(id,law_firm_tenant_id,request_id,cycle,user_id,channel,manual)
            SELECT gen_random_uuid(),$1,$2,$3,person,channel,$4
            FROM unnest($5::integer[]) AS recipient(person) CROSS JOIN unnest($6::text[]) AS chosen(channel)
            ON CONFLICT(request_id,cycle,user_id,channel) DO NOTHING`,
        [row.law_firm_tenant_id,row.id,row.cycle,row.manual_pending,recipients.map(person => person.userid),
            row.channels.filter(channel => settings.available.includes(channel))]);
        await db.query('UPDATE case_document_requests SET next_due=NULL,manual_pending=false WHERE id=$1',[row.id]);
    });
    const pending=(await pool.query("SELECT d.id,r.case_id,r.id AS request_id FROM case_document_deliveries d JOIN case_document_requests r ON r.id=d.request_id WHERE d.status='PENDING' ORDER BY d.scheduled_for LIMIT 100")).rows;
    for (const candidate of pending) {
        const dispatch=await transaction(pool,async db=>{
            const record=await caseRow(db,candidate.case_id,true); const row=await requestRow(db,candidate.case_id,candidate.request_id);
            const job=(await db.query("SELECT * FROM case_document_deliveries WHERE id=$1 AND status='PENDING' FOR UPDATE",[candidate.id])).rows[0];
            if (!job) return null;
            const person=(await db.query(`SELECT u.* FROM users u JOIN case_users cu ON cu.userid=u.userid WHERE cu.caseid=$1 AND u.userid=$2
                AND u.role IN ('User','Client') AND u.law_firm_tenant_id IS NOT DISTINCT FROM $3::uuid`,[row.case_id,job.user_id,row.law_firm_tenant_id])).rows[0];
            if (!await active(db,row,record) || !person || !settings.available.includes(job.channel) || (!job.manual && (!row.automatic || !settings.enabled))) {
                await db.query("UPDATE case_document_deliveries SET status='CANCELLED',cancelled_at=now() WHERE id=$1",[job.id]);return null;
            }
            const items=missing(row).map(item=>item.title);
            await db.query("UPDATE case_document_deliveries SET status='SENDING',claimed_at=now(),content_items=$2 WHERE id=$1",[job.id,JSON.stringify(items)]);
            return {row,job,person,items,record};
        });
        if (!dispatch) continue;
        const {row,job,person,items,record}=dispatch;
        const message=`לצורך ${row.stage_title} בתיק ${record.casename} נבקש להעביר למשרד: ${items.join(', ')}.`;
        let status='UNKNOWN', error='DELIVERY_UNCONFIRMED';
        try {
            const send=notify || require('./notifications/notificationOrchestrator').notifyRecipient;
            const result=await send({recipientUserId:person.userid,recipientEmail:person.email,recipientPhone:person.phonenumber,
                notificationType:'DOCUMENT_REQUEST',skipAdminCc:true,respectExplicitChannelChoice:true,
                ...(job.channel==='email'?{email:{campaignKey:'DOCUMENT_REQUEST',contactFields:{recipient_name:person.name,case_title:record.casename,case_stage:row.stage_title,document_name:items.join(', ')}}}:{}),
                ...(job.channel==='sms'?{sms:{messageBody:message}}:{}),
                ...(job.channel==='push'?{push:{title:'מסמכים חסרים',body:message,data:{caseId:String(row.case_id)}}}:{}),
            });
            const outcome=result?.outcomes?.[job.channel];
            if (!outcome?.attempted) {status='FAILED';error='MISSING_CONTACT';}
            else if (outcome.ok) {status=outcome.simulated?'SIMULATED':'SENT';error=null;}
        } catch { /* Persist unknown; provider might have accepted the call. */ }
        await pool.query("UPDATE case_document_deliveries SET status=$2,error=$3,sent_at=CASE WHEN $2 IN ('SENT','SIMULATED') THEN now() ELSE NULL END WHERE id=$1 AND status='SENDING'",[job.id,status,error]);
    }
    const finished=(await pool.query(`SELECT r.id,r.case_id FROM case_document_requests r WHERE r.state='active' AND r.next_due IS NULL
        AND EXISTS(SELECT 1 FROM case_document_deliveries d WHERE d.request_id=r.id AND d.cycle=r.cycle)
        AND NOT EXISTS(SELECT 1 FROM case_document_deliveries d WHERE d.request_id=r.id AND d.cycle=r.cycle AND d.status IN ('PENDING','SENDING')) LIMIT 100`)).rows;
    for(const candidate of finished) await transaction(pool,async db=>{
        const record=await caseRow(db,candidate.case_id,true);const row=await requestRow(db,candidate.case_id,candidate.id);
        if (row.state!=='active' || row.next_due) return;
        const jobs=(await db.query('SELECT status FROM case_document_deliveries WHERE request_id=$1 AND cycle=$2',[row.id,row.cycle])).rows;
        if (!jobs.length || jobs.some(job=>['PENDING','SENDING'].includes(job.status))) return;
        const delivered=jobs.every(job=>['SENT','SIMULATED'].includes(job.status));
        const again=delivered && row.automatic && settings.enabled && await active(db,row,record);
        await db.query(`UPDATE case_document_requests SET state=$2,next_due=CASE WHEN $3 THEN now()+($4*interval '1 hour') ELSE NULL END,
            first_sent_at=CASE WHEN $5 THEN COALESCE(first_sent_at,now()) ELSE first_sent_at END,cycle=cycle+1 WHERE id=$1`,
        [row.id,again?'active':'paused',!!again,row.first_sent_at?settings.repeatHours:settings.firstHours,delivered]);
        await audit(db,row,null,delivered?'sent':'delivery_attention');
    });
    return {processed:pending.length};
}
async function afterTransition(db,record,actor) {
    if(record.isclosed)return;
    // Only first entry to a configured draft may start an initial request.
    await db.query(`UPDATE case_document_requests r SET state='active',manual_pending=true,next_due=now(),created_by=$2,version=version+1
        FROM casedescriptions d WHERE r.description_id=d.descriptionid AND r.case_id=$1 AND d.stage=$3
        AND r.state='draft' AND r.send_on_entry=true`,[record.caseid,actor,record.currentstage]);
}
module.exports={afterTransition,defaults,missing,policy,list,save,action,initialize,beforeTransition,processDue};
