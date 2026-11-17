'use strict';
function start() {
    let running=false;
    async function tick(){
        if(running)return;running=true;
        try { await require('../../lib/tenant/officeJobs').forEachOffice(()=>require('../../services/caseDocumentRequests').processDue(require('../../config/db'))); }
        catch(error){console.error('[document-requests] tick failed',error.errorCode || error.code || 'UNEXPECTED');}
        finally{running=false;}
    }
    const timer=setInterval(tick,60000);timer.unref?.();void tick();
    return ()=>clearInterval(timer);
}
module.exports={start};
