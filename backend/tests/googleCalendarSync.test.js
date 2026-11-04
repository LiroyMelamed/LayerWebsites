const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const callback = require('../lib/googleCalendarCallback');
test('live callback derives from the public API origin despite copied localhost config', () => {
    assert.equal(callback({NODE_ENV:'production',PUBLIC_API_BASE_URL:'https://api-qa.example.com',GOOGLE_OAUTH_REDIRECT_URI:'http://localhost:5001/api/calendar/google/callback'}),'https://api-qa.example.com/api/calendar/google/callback');
    assert.throws(()=>callback({NODE_ENV:'production',GOOGLE_OAUTH_REDIRECT_URI:'http://localhost:5001/callback'}),/PUBLIC_ORIGIN/);
});
test('manual synchronization uses the same owner-scoped two-way service as the worker', async () => {
    const source=fs.readFileSync(require.resolve('../controllers/calendarController'),'utf8');
    const start=source.indexOf('const syncGoogleEvents ='),end=source.indexOf('const resolveGoogleConflict',start);
    let called;
    const handler=vm.runInNewContext(source.slice(start,end)+';syncGoogleEvents',{
        _isGoogleSyncEnabledForFirm:async()=>true,
        require:()=>({syncAccount:async id=>{called=id;return {ok:true,synced:3};}}),
    });
    let body;await handler({user:{UserId:42}},{json:value=>{body=value;}});
    assert.equal(called,42);assert.equal(body.synced,3);
});
