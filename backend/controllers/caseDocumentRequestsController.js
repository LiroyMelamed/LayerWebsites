'use strict';
const pool=require('../config/db');
const service=require('../services/caseDocumentRequests');
const {assertCaseRecordAccess}=require('../lib/firmPermissions/caseAccess');
const {createAppError}=require('../utils/appError');
const {getCurrentTenantId}=require('../lib/tenant/tenantContext');
const run=(action,fn)=>async(req,res,next)=>{
    try {
        res.set('Cache-Control','private, no-store');
        const caseId=Number(req.params.caseId);
        if (!Number.isSafeInteger(caseId)||caseId<=0) throw createAppError('INVALID_CASE',400);
        const denied=await assertCaseRecordAccess(req,caseId,action);if(denied)throw denied;
        if (!(await pool.query('SELECT 1 FROM cases WHERE caseid=$1 AND law_firm_tenant_id IS NOT DISTINCT FROM $2::uuid',[caseId,getCurrentTenantId()])).rows.length) throw createAppError('NOT_FOUND',404);
        await fn(req,res,caseId);
    }catch(error){next(error);}
};
exports.list=run('view',async(req,res,id)=>res.json(await service.list(pool,id,{client:['User','Client'].includes(req.user.Role)})));
exports.save=run('edit',async(req,res,id)=>res.json(await service.save(pool,req.user.UserId,id,req.body)));
exports.action=run('edit',async(req,res,id)=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id))throw createAppError('INVALID_REQUEST',400);await service.action(pool,req.user.UserId,id,req.params.id,req.body);res.json({ok:true});});
exports.transition=run('view',async(req,res,id)=>{
    const result=await service.list(pool,id);
    const record=(await pool.query('SELECT currentstage FROM cases WHERE caseid=$1',[id])).rows[0];
    const stages=(await pool.query('SELECT descriptionid FROM casedescriptions WHERE caseid=$1 AND stage=$2',[id,record.currentstage])).rows;
    const active=new Set(stages.map(stage=>stage.descriptionid));
    res.json({missing:result.requests.filter(row=>active.has(row.description_id)).flatMap(row=>service.missing(row).map(item=>item.title))});
});
