const {Pool}=require('pg');
if(process.env.STAGE_TEST_SOCKET!=='/tmp/codex-stage-automation-55494'||!/^stage_[a-f0-9]{32}$/.test(process.env.STAGE_TEST_SCHEMA||''))throw Error('Owned stage QA schema required');
const pool=new Pool({host:process.env.STAGE_TEST_SOCKET,port:55494,database:'postgres',user:'stage_automation_test_owner',options:`-c search_path=${process.env.STAGE_TEST_SCHEMA},public`,max:1});
process.env.SIGNING_V2_ENABLED='true';process.env.SIGNING_ENABLED='true';
require('../../services/signingV2/caseStageAutomation').processOne(pool,{reserveCapacity:async()=>{
 process.send({phase:'uncommitted-directory-and-case-run'});
 await new Promise(()=>{});
}}).catch(error=>{console.error(error.errorCode||error.code||'CHILD_FAILED');process.exitCode=1;});
