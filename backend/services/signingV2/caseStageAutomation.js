const { randomUUID } = require('node:crypto');
const { digest } = require('../../lib/signingV2/canonical');
const { UUID } = require('../../lib/signingV2/compiler');
const { expect, fail } = require('../../lib/signingV2/errors');
const { hasAreaAction, normalizeRolePermissions, getSigningDataScope, getCasesDataScope } = require('../../lib/firmRolePermissions');
const { assertCases } = require('./access');
const { caseId: integerId } = require('./caseContext');
const { transaction } = require('./transaction');
const creation = require('./creation');

// A worker must reconstruct complete CURRENT creation + case permissions. No
// JWT/request snapshot, role name, or saved legal capacity can grant authority.
async function currentScope(db, contextId, userId, { edit = false } = {}) {
    const row = (await db.query(`SELECT u.userid,u.role,u.firm_staff_role_id,u.law_firm_tenant_id,
        EXISTS(SELECT 1 FROM platform_admins p WHERE p.user_id=u.userid AND p.is_active) AS platform_admin
        FROM signing_owner_contexts c JOIN users u ON u.userid=$2 AND u.law_firm_tenant_id IS NOT DISTINCT FROM c.law_firm_tenant_id
        WHERE c.id=$1 FOR SHARE OF u`, [contextId,userId])).rows[0];
    if (!row || !['Admin','Lawyer','Staff'].includes(row.role)) return null;
    const custom = !row.platform_admin && !!row.firm_staff_role_id;
    if(row.firm_staff_role_id) Object.assign(row,(await db.query('SELECT permissions,is_active,law_firm_tenant_id AS role_tenant FROM firm_staff_roles WHERE id=$1 FOR SHARE',[row.firm_staff_role_id])).rows[0] || {});
    const permissions = normalizeRolePermissions(row.permissions);
    if (custom) {
        if (!row.is_active || String(row.role_tenant || '') !== String(row.law_firm_tenant_id || '')
            || !['view','upload'].every(action => hasAreaAction(permissions,'signing',action))
            || !hasAreaAction(permissions,'cases','view') || (edit && !hasAreaAction(permissions,'cases','edit'))) return null;
    } else if (!row.platform_admin && (!['Admin','Lawyer'].includes(row.role) || (edit && row.role!=='Admin'))) return null;
    return { contextId,userId,tenantId:row.law_firm_tenant_id,all:!custom || getSigningDataScope(permissions)==='all_firm',
        assignedCases:custom && permissions.areas?.signing?.legacyCaseAssignment===true,
        caseView:true,caseAll:!custom || getCasesDataScope(permissions)==='all_firm',send:true,
        clientView:custom ? hasAreaAction(permissions,'clients','view') : row.platform_admin || row.role==='Admin' };
}

async function visibleCase(db, scope, id, lock = false) {
    id = integerId(id);
    await assertCases(db, scope, [id]);
    const row = (await db.query(`SELECT caseid AS "CaseId",casename AS "CaseName",currentstage AS "CurrentStage",isclosed AS "IsClosed",userid AS "UserId"
        FROM cases WHERE caseid=$1 ${lock ? 'FOR UPDATE' : ''}`,[id])).rows[0];
    if (!row) fail('NOT_FOUND',404);
    return row;
}
async function author(db, scope, id) {
    const current = await currentScope(db,scope.contextId,scope.userId,{edit:true});
    if (!current) fail('FORBIDDEN',403);
    const record = await visibleCase(db,current,id,true);
    return { scope:current,record };
}
async function stage(db,id,descriptionId) {
    descriptionId=integerId(descriptionId);
    const result=(await db.query('SELECT descriptionid AS "descriptionId",stage,text AS title FROM casedescriptions WHERE caseid=$1 AND descriptionid=$2',[id,descriptionId])).rows[0];
    if (!result) fail('NOT_FOUND',404);
    return result;
}
function people(input) {
    const result=[];
    for (const [key,value] of Object.entries(input.shared || {})) for(const person of value?.people || [value]) result.push({path:`shared.${key}`,person});
    for (const [key,value] of Object.entries(input.rows?.[0]?.recipients || {})) for(const person of value?.people || [value]) result.push({path:`rows.0.${key}`,person});
    return result;
}
// Manual people are explicit immutable config. Picked accounts additionally bind
// their current directory contact and role; later changes stop the run visibly.
async function contactHash(db,scope,input) {
    const selected=people(input).filter(item=>item.person?.contactUserId!=null);
    const ids=[...new Set(selected.map(item=>integerId(item.person.contactUserId)))].sort((a,b)=>a-b);
    if (!ids.length) return digest([]);
    const rows=(await db.query(`SELECT userid,name,email,phonenumber,role FROM users WHERE userid=ANY($1::integer[])
        AND law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid AND role IN ('Admin','Lawyer','Staff','User','Client','ExternalSigner')
        ORDER BY userid FOR SHARE`,[ids,scope.tenantId])).rows;
    if(rows.length!==ids.length)fail('STAGE_CONTACT_CHANGED',409);
    for(const {person} of selected) {
        const current=rows.find(row=>row.userid===Number(person.contactUserId));
        const email=value=>String(value||'').trim().toLowerCase();
        if(current.name!==person.name || email(current.email)!==email(person.email)
            || creation.normalizePhone(current.phonenumber)!==creation.normalizePhone(person.phone))fail('STAGE_CONTACT_CHANGED',409);
    }
    return digest(rows.map(row=>({id:row.userid,name:row.name,email:row.email||null,phone:creation.normalizePhone(row.phonenumber)||null,role:row.role})));
}
async function caseHash(db,id) {
    const current=(await db.query('SELECT userid,casemanagerid FROM cases WHERE caseid=$1',[id])).rows[0];
    if(!current)fail('STAGE_CASE_CHANGED',409);
    const linked=(await db.query('SELECT userid FROM case_users WHERE caseid=$1 ORDER BY userid FOR SHARE',[id])).rows.map(row=>row.userid);
    return digest({primaryUserId:current.userid || null,managerId:current.casemanagerid || null,linkedUserIds:linked});
}
function inputFor(record,body,title) {
    expect(body && Array.isArray(body.rows) && body.rows.length===1,'INVALID_ROWS');
    expect(Buffer.byteLength(JSON.stringify(body))<=128*1024,'CAPACITY_BUDGET_EXCEEDED');
    const input={templateVersionId:body.templateVersionId,name:body.name || `${record.CaseName} — ${title}`,
        rows:JSON.parse(JSON.stringify(body.rows)),shared:JSON.parse(JSON.stringify(body.shared || {})),caseId:record.CaseId};
    for(const key of ['roleAudience','omittedRoles','signingOrder','reviewerUserId']) if(body[key]!=null)input[key]=body[key];
    // Client context is explicit/optional. It never grants recipient authority.
    if (body.clientId!=null) { expect(Number(body.clientId)===Number(record.UserId),'STAGE_CASE_CHANGED');input.clientId=Number(body.clientId); }
    // The incumbent composer supplies the EXISTING UI preference uniformly.
    // There is no per-recipient language choice or document translation here.
    const selected=people(input).map(item=>item.person).filter(person=>person && !person.sameAsRole);
    const locales=[...new Set(selected.map(person=>person.locale).filter(Boolean))];
    expect(locales.length<=1 && locales.every(locale=>['he','ar','en'].includes(locale)),'INVALID_LOCALE');
    for(const person of selected) {if(locales.length)person.locale=locales[0];else delete person.locale;}
    return input;
}
async function previewIn(db,scope,record,descriptionId,body) {
    const target=await stage(db,record.CaseId,descriptionId);
    const input=inputFor(record,body,target.title);
    const contacts=await contactHash(db,scope,input);
    const checked=await creation.previewCreation(db,scope,input);
    const context=await caseHash(db,record.CaseId);
    const preview={...checked,previewHash:checked.valid ? digest({creationHash:checked.previewHash,caseHash:context,contactHash:contacts}):null};
    return {input,contacts,context,creationHash:checked.previewHash,preview,target};
}
function ruleView(row,triggered=false) {
    return {id:row.id,descriptionId:row.description_id,version:row.version,enabled:row.enabled,
        ...row.input,templateName:row.template_name,template:row.template_metadata,configuredBy:row.configured_by,alreadyTriggered:triggered,updatedAt:row.updated_at};
}
function runView(row) {
    return {id:row.id,descriptionId:row.description_id,stageTitle:row.stage_title,version:row.version,ruleVersion:row.rule_version,
        status:row.status,errorCode:row.error_code,submissionId:row.submission_id,createdAt:row.created_at,completedAt:row.completed_at};
}
async function list(db,scope,id) {
    const record=await visibleCase(db,scope,id);
    const stages=(await db.query('SELECT descriptionid AS "descriptionId",stage,text AS title FROM casedescriptions WHERE caseid=$1 ORDER BY stage,descriptionid',[record.CaseId])).rows;
    const rules=(await db.query('SELECT r.*,EXISTS(SELECT 1 FROM signing_case_stage_runs n WHERE n.owner_context_id=r.owner_context_id AND n.rule_id=r.id) AS triggered FROM signing_case_stage_rules r WHERE owner_context_id=$1 AND case_id=$2 AND ($3::boolean OR configured_by=$4) ORDER BY description_id',[scope.contextId,record.CaseId,scope.all,scope.userId])).rows;
    const runs=(await db.query('SELECT * FROM signing_case_stage_runs WHERE owner_context_id=$1 AND case_id=$2 AND ($3::boolean OR configured_by=$4) ORDER BY created_at DESC,id DESC LIMIT 100',[scope.contextId,record.CaseId,scope.all,scope.userId])).rows;
    return {case:record,stages,rules:rules.map(row=>ruleView(row,row.triggered)),runs:runs.map(runView)};
}
async function preview(pool,scope,id,descriptionId,body) {
    return transaction(pool,async db=>{const current=await author(db,scope,id);return (await previewIn(db,current.scope,current.record,descriptionId,body)).preview;});
}
async function save(pool,scope,id,descriptionId,body) {
    return transaction(pool,async db=>{
        const current=await author(db,scope,id);scope=current.scope;id=current.record.CaseId;descriptionId=integerId(descriptionId);
        expect(Number.isSafeInteger(body.expectedVersion)&&body.expectedVersion>=0 && typeof body.enabled==='boolean','INVALID_ACTION');
        const existing=(await db.query('SELECT * FROM signing_case_stage_rules WHERE owner_context_id=$1 AND case_id=$2 AND description_id=$3 FOR UPDATE',[scope.contextId,id,descriptionId])).rows[0];
        if(existing && !scope.all && existing.configured_by!==scope.userId)fail('NOT_FOUND',404);
        if((existing?.version || 0)!==body.expectedVersion)fail('PREVIEW_CHANGED',412);
        let result;
        if(!body.enabled) {
            if(!existing)fail('NOT_FOUND',404);
            result=(await db.query('UPDATE signing_case_stage_rules SET enabled=false,version=version+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING *',[existing.id])).rows[0];
            await db.query("UPDATE signing_case_stage_runs SET status='cancelled',error_code='STAGE_RULE_DISABLED',version=version+1,updated_at=clock_timestamp(),completed_at=clock_timestamp() WHERE rule_id=$1 AND status IN ('queued','blocked')",[existing.id]);
        } else {
            const prepared=await previewIn(db,scope,current.record,descriptionId,body);
            if(!prepared.preview.valid)fail('INVALID_ROWS',422,prepared.preview.errors);
            if(body.previewHash!=null && body.previewHash!==prepared.preview.previewHash)fail('PREVIEW_CHANGED',412);
            result=(await db.query(`INSERT INTO signing_case_stage_rules(id,owner_context_id,case_id,description_id,enabled,configured_by,template_version_id,template_name,template_metadata,input,preview_hash,contact_hash,case_hash)
                VALUES($1,$2,$3,$4,true,$5,$6,$7,$8,$9,$10,$11,$12)
                ON CONFLICT(owner_context_id,case_id,description_id) DO UPDATE SET version=signing_case_stage_rules.version+1,
                enabled=true,configured_by=EXCLUDED.configured_by,template_version_id=EXCLUDED.template_version_id,template_name=EXCLUDED.template_name,template_metadata=EXCLUDED.template_metadata,
                input=EXCLUDED.input,preview_hash=EXCLUDED.preview_hash,contact_hash=EXCLUDED.contact_hash,case_hash=EXCLUDED.case_hash,updated_at=clock_timestamp() RETURNING *`,
                [existing?.id || randomUUID(),scope.contextId,id,descriptionId,scope.userId,prepared.input.templateVersionId,prepared.preview.template.name,prepared.preview.template,prepared.input,prepared.creationHash,prepared.contacts,prepared.context])).rows[0];
        }
        const triggered=(await db.query('SELECT 1 FROM signing_case_stage_runs WHERE rule_id=$1',[result.id])).rowCount>0;
        return {rule:ruleView(result,triggered)};
    });
}

// Called inside BOTH case mutation transactions, after locking the case and
// saving descriptions. No message/PDF/provider work occurs in that transaction.
async function stageIdentity(db,caseId,currentStage) {
    return (await db.query('SELECT descriptionid FROM casedescriptions WHERE caseid=$1 AND stage=$2 ORDER BY descriptionid LIMIT 1',[caseId,currentStage])).rows[0]?.descriptionid || null;
}
async function recordTransition(db,{caseId,oldDescriptionId,oldClosed,newClosed,actorId}) {
    if(process.env.SIGNING_V2_ENABLED!=='true')return [];
    const record=(await db.query('SELECT currentstage FROM cases WHERE caseid=$1',[caseId])).rows[0];
    const newDescriptionId=await stageIdentity(db,caseId,record?.currentstage);
    // Deleted stable stages are never resurrected by a later stage with the same number.
    await db.query(`UPDATE signing_case_stage_rules r SET enabled=false,version=version+1,updated_at=clock_timestamp()
        WHERE r.case_id=$1 AND r.enabled AND NOT EXISTS(SELECT 1 FROM casedescriptions d WHERE d.caseid=r.case_id AND d.descriptionid=r.description_id)`,[caseId]);
    await db.query(`UPDATE signing_case_stage_runs n SET status='cancelled',error_code='STAGE_REMOVED',version=version+1,
        completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE n.case_id=$1 AND n.status IN ('queued','blocked')
        AND NOT EXISTS(SELECT 1 FROM casedescriptions d WHERE d.caseid=n.case_id AND d.descriptionid=n.description_id)`,[caseId]);
    if(oldClosed || newClosed || !oldDescriptionId || !newDescriptionId || oldDescriptionId===newDescriptionId)return [];
    const oldStage=(await db.query('SELECT stage FROM casedescriptions WHERE caseid=$1 AND descriptionid=$2',[caseId,oldDescriptionId])).rows[0]?.stage;
    if(!oldStage || Number(record.currentstage)<=Number(oldStage))return [];
    const rows=(await db.query(`INSERT INTO signing_case_stage_runs(id,owner_context_id,rule_id,case_id,description_id,stage_title,rule_version,configured_by,transition_by,input,preview_hash,contact_hash,case_hash)
        SELECT gen_random_uuid(),r.owner_context_id,r.id,r.case_id,r.description_id,d.text,r.version,r.configured_by,$3,r.input,r.preview_hash,r.contact_hash,r.case_hash
        FROM signing_case_stage_rules r JOIN casedescriptions d ON d.caseid=r.case_id AND d.descriptionid=r.description_id
        WHERE r.case_id=$1 AND r.description_id=$2 AND r.enabled
        ON CONFLICT(owner_context_id,rule_id) DO NOTHING RETURNING id`,[caseId,newDescriptionId,actorId])).rows;
    return rows.map(row=>row.id);
}

async function alert(db,run,code) {
    await db.query(`INSERT INTO signing_error_alerts(owner_context_id,source_key,phase,error_code,severity,stage_run_id,case_id)
        VALUES($1,$2,'case_stage_documents',$3,'needs_attention',$4,$5) ON CONFLICT
        ((COALESCE(owner_context_id,'00000000-0000-0000-0000-000000000000'::uuid)),source_key,phase,error_code,severity)
        DO UPDATE SET last_seen_at=clock_timestamp(),occurrences=signing_error_alerts.occurrences+1`,
        [run.owner_context_id,`stage-run:${run.id}`,code,run.id,run.case_id]);
}
const safeCode=error=>/^[A-Z][A-Z0-9_]{1,79}$/.test(error?.errorCode || '')?error.errorCode:'STAGE_PROCESSING_FAILED';
async function assertSigningEnabled() {
    const value=String(process.env.SIGNING_ENABLED ?? '').trim();
    const allowed=value ? ['true','1'].includes(value.toLowerCase())
        : (await require('../../lib/firm/resolveFirmSigningPolicy').resolveFirmSigningPolicy(null)).signingEnabled;
    if(!allowed)fail('STAGE_SIGNING_DISABLED',403);
}
async function processOne(pool,{reserveCapacity,contextIds=null}={}) {
    expect(typeof reserveCapacity==='function','CAPACITY_ADAPTER_REQUIRED');
    return transaction(pool,async db=>{
        // Lock order matches case edits: case -> rule -> run. SKIP LOCKED lets
        // another worker progress, and SQL-only creation rolls back on a crash.
        const selected=(await db.query(`SELECT c.caseid FROM cases c WHERE EXISTS(SELECT 1 FROM signing_case_stage_runs n
            WHERE n.case_id=c.caseid AND n.status='queued' AND ($1::uuid[] IS NULL OR n.owner_context_id=ANY($1::uuid[])))
            ORDER BY c.caseid LIMIT 1 FOR UPDATE OF c SKIP LOCKED`,[contextIds])).rows[0];
        if(!selected)return false;
        const rule=(await db.query(`SELECT r.* FROM signing_case_stage_rules r JOIN signing_case_stage_runs n ON n.rule_id=r.id
            WHERE n.case_id=$1 AND n.status='queued' AND ($2::uuid[] IS NULL OR n.owner_context_id=ANY($2::uuid[])) ORDER BY n.created_at,n.id LIMIT 1 FOR UPDATE OF r`,[selected.caseid,contextIds])).rows[0];
        if(!rule)return false;
        const run=(await db.query("SELECT * FROM signing_case_stage_runs WHERE rule_id=$1 AND status='queued' FOR UPDATE",[rule.id])).rows[0];
        if(!run)return false;
        await db.query('SAVEPOINT stage_creation');
        try {
            await assertSigningEnabled();
            if(!rule.enabled)fail('STAGE_RULE_DISABLED',409);
            if(rule.version!==run.rule_version)fail('STAGE_RULE_CHANGED',409);
            const scope=await currentScope(db,run.owner_context_id,run.configured_by,{edit:true});
            if(!scope)fail('STAGE_PERMISSION_REVOKED',403);
            const record=await visibleCase(db,scope,run.case_id);
            if(record.IsClosed || await stageIdentity(db,run.case_id,record.CurrentStage)!==run.description_id)fail('STAGE_CASE_CHANGED',409);
            if(await caseHash(db,run.case_id)!==run.case_hash)fail('STAGE_CASE_CHANGED',409);
            if(await contactHash(db,scope,run.input)!==run.contact_hash)fail('STAGE_CONTACT_CHANGED',409);
            let checked;
            try {checked=await creation.previewCreation(db,scope,run.input);} catch(error) {
                if(error.errorCode==='NOT_FOUND')fail('STAGE_TEMPLATE_UNAVAILABLE',409);
                throw error;
            }
            if(!checked.valid)fail('STAGE_DATA_REQUIRED',422);
            if(checked.previewHash!==run.preview_hash)fail('STAGE_DATA_CHANGED',409);
            const result=await creation.createFromRowsInTransaction(db,scope,{...run.input,previewHash:run.preview_hash,idempotencyKey:run.id},{reserveCapacity});
            await db.query("UPDATE signing_case_stage_runs SET status='created',submission_id=$2,error_code=NULL,version=version+1,completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1",[run.id,result.submissionId]);
            await db.query('RELEASE SAVEPOINT stage_creation');
        } catch(error) {
            await db.query('ROLLBACK TO SAVEPOINT stage_creation');
            const code=safeCode(error);
            await db.query("UPDATE signing_case_stage_runs SET status=$2,error_code=$3,version=version+1,completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1",[run.id,code==='STAGE_RULE_DISABLED'?'cancelled':'blocked',code]);
            if(code!=='STAGE_RULE_DISABLED')await alert(db,run,code);
        }
        return true;
    });
}
async function retry(pool,scope,id,runId,body) {
    expect(UUID.test(runId),'INVALID_ACTION');
    return transaction(pool,async db=>{
        const current=await author(db,scope,id);scope=current.scope;
        const rule=(await db.query(`SELECT r.* FROM signing_case_stage_rules r JOIN signing_case_stage_runs n ON n.rule_id=r.id
            WHERE n.id=$1 AND n.owner_context_id=$2 AND n.case_id=$3 FOR UPDATE OF r`,[runId,scope.contextId,current.record.CaseId])).rows[0];
        const run=(await db.query('SELECT * FROM signing_case_stage_runs WHERE id=$1 AND owner_context_id=$2 FOR UPDATE',[runId,scope.contextId])).rows[0];
        if(!rule || !run || (!scope.all && rule.configured_by!==scope.userId))fail('NOT_FOUND',404);
        if(run.version!==body.expectedVersion)fail('PREVIEW_CHANGED',412);
        expect(run.status==='blocked' && !run.submission_id && rule.enabled,'INVALID_ACTION');
        expect(!current.record.IsClosed && await stageIdentity(db,current.record.CaseId,current.record.CurrentStage)===run.description_id,'STAGE_CASE_CHANGED');
        // Explicit retry uses the current saved configuration and sender, never
        // silently refreshes a previously approved contact or template revision.
        const configured=await currentScope(db,scope.contextId,rule.configured_by,{edit:true});
        if(!configured)fail('STAGE_PERMISSION_REVOKED',403);
        const checked=await previewIn(db,configured,current.record,run.description_id,rule.input);
        expect(checked.preview.valid,'STAGE_DATA_REQUIRED');
        expect(checked.creationHash===rule.preview_hash && checked.contacts===rule.contact_hash && checked.context===rule.case_hash,'STAGE_DATA_CHANGED');
        const row=(await db.query(`UPDATE signing_case_stage_runs SET status='queued',rule_version=$2,configured_by=$3,input=$4,preview_hash=$5,contact_hash=$6,case_hash=$7,
            error_code=NULL,version=version+1,completed_at=NULL,updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,
            [run.id,rule.version,rule.configured_by,rule.input,rule.preview_hash,rule.contact_hash,rule.case_hash])).rows[0];
        return {run:runView(row)};
    });
}
// Only packages created by this automation receive this extra fence. Ordinary
// packages retain their incumbent behavior and explicit follow-up workflows.
async function originGuard(db,contextId,packageId,{recordFailure=false}={}) {
    const run=(await db.query(`SELECT n.* FROM signing_case_stage_runs n JOIN signing_packages p
        ON p.owner_context_id=n.owner_context_id AND p.submission_id=n.submission_id
        WHERE p.owner_context_id=$1 AND p.id=$2`,[contextId,packageId])).rows[0];
    if(!run)return null;
    let code=null;
    try {
        await assertSigningEnabled();
        const scope=await currentScope(db,contextId,run.configured_by,{edit:true});
        if(!scope)fail('STAGE_PERMISSION_REVOKED',403);
        await visibleCase(db,scope,run.case_id);
        const record=(await db.query('SELECT currentstage,isclosed FROM cases WHERE caseid=$1 FOR SHARE',[run.case_id])).rows[0];
        if(!record || record.isclosed || await stageIdentity(db,run.case_id,record.currentstage)!==run.description_id)fail('STAGE_CASE_CHANGED',409);
        if(await caseHash(db,run.case_id)!==run.case_hash)fail('STAGE_CASE_CHANGED',409);
        if(await contactHash(db,scope,run.input)!==run.contact_hash)fail('STAGE_CONTACT_CHANGED',409);
    } catch(error) {code=error.errorCode==='NOT_FOUND'?'STAGE_PERMISSION_REVOKED':safeCode(error);}
    if(code && recordFailure) {
        await db.query('UPDATE signing_case_stage_runs SET error_code=$2,version=version+1,updated_at=clock_timestamp() WHERE id=$1',[run.id,code]);
        await alert(db,run,code);
    }
    return code;
}
module.exports={list,preview,save,retry,recordTransition,stageIdentity,processOne,currentScope,contactHash,inputFor,originGuard,caseHash};
