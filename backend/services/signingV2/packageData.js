'use strict';
const {RenderPool}=require('./renderPool');
const {expect}=require('../../lib/signingV2/errors');
// Reuse the signing renderer, but release its browser after preparing a source.
// Admission is process-wide, preventing concurrent HTTP requests from spawning
// unbounded browsers alongside the existing signing worker pool.
let active=false;
async function renderData(input) {
    expect(!active,'RENDERER_BUSY');
    active=true;
    const renderer=new RenderPool({concurrency:1,maxQueued:1,maxBytes:20*1024*1024,
        executablePath:String(process.env.PUPPETEER_EXECUTABLE_PATH||'').trim()||undefined,
        noSandbox:process.env.PUPPETEER_NO_SANDBOX==='true'||process.env.IS_PRODUCTION==='true'});
    try {return await renderer.render(input);}
    finally {await renderer.close();active=false;}
}
module.exports={renderData};
