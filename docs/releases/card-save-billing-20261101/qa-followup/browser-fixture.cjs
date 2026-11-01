'use strict';

// Local browser fixture: actual billing screens/components, synthetic HTTP API
// and synthetic iframe. It never loads application .env or payment credentials.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { createRequire } = require('node:module');
const ROOT = path.resolve(__dirname, '../../../../');
const FRONT = path.join(ROOT, 'frontend');
const DEPS = '/Users/liroymelamed/Projects/LayerWebsites/frontend/node_modules';
const req = createRequire(path.join(DEPS, 'webpack/package.json'));
const webpack = req('webpack');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-browser-qa-'));
const APP = 'http://127.0.0.1:55701';
const GATEWAY = 'http://127.0.0.1:55702';
const { resolvePricingLineItems, quotasForPackage } = require(path.join(ROOT, 'backend/lib/billing/pricingPackage'));
let state;
function reset(scenario = 'success') {
    if (!['success', 'decline', 'unknown', 'no-debt'].includes(scenario)) throw Error('UNKNOWN_SCENARIO');
    state = { scenario, checkouts: 0, confirmations: 0, confirmBodies: [], fee: 0, subscriptionCharges: 0,
        savedCard: false, paid: false, pending: false, calls: [], messages: [], completed: {} };
}
reset();
const selection = { platformId: 'site_app', resourceId: 'pro', signingId: '500' };
function plan() {
    const pkg = resolvePricingLineItems(selection);
    const noDebt = state.scenario === 'no-debt';
    return { scope: 'firm', planKey: 'PRO', name: 'משרד בדיקה מקומי', package: pkg,
        priceMonthlyCents: 135300, priceCurrency: 'ILS', quotas: quotasForPackage(pkg),
        effectiveDocumentsRetentionDaysCore: 180, effectiveDocumentsRetentionDaysPii: 180,
        disabledOptions: { platformIds: [], resourceIds: [], signingIds: [] },
        billing: { billingEnabled: true, autoRenew: true, stillComplimentary: false, locked: !noDebt && !state.paid,
            status: noDebt || state.paid ? 'active' : 'past_due', billingInterval: 'monthly',
            priceMonthlyIls: 1353, priceYearlyIls: 14612, nextChargeIls: 1353,
            renewsAt: noDebt || state.paid ? '2026-12-01T00:00:00Z' : '2026-10-01T00:00:00Z',
            graceUntil: !noDebt && !state.paid ? '2026-11-04T00:00:00Z' : null,
            lastPaidAt: state.paid ? '2026-11-01T00:00:00Z' : null,
            setupCheckoutAmountIls: 1, takbullMode: 'test', payments: [],
            card: state.savedCard ? { last4: '1234', expMonth: '12', expYear: '2030' } : null } };
}
function json(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
}
async function body(req) {
    let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 100000) throw Error('BODY_TOO_LARGE'); }
    return raw ? JSON.parse(raw) : {};
}
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route,Navigate} from 'react-router-dom';
import {ScreenSizeProvider} from ${JSON.stringify(path.join(FRONT, 'src/providers/ScreenSizeProvider'))};
import {BillingLockProvider} from ${JSON.stringify(path.join(FRONT, 'src/providers/BillingLockProvider'))};
import {ToastProvider} from ${JSON.stringify(path.join(FRONT, 'src/components/ui/toast'))};
import PlanUsageScreen from ${JSON.stringify(path.join(FRONT, 'src/screens/billingScreen/PlanUsageScreen'))};
import PlansPricingScreen from ${JSON.stringify(path.join(FRONT, 'src/screens/billingScreen/PlansPricingScreen'))};
import ${JSON.stringify(path.join(FRONT, 'src/i18n/i18n'))};
import ${JSON.stringify(path.join(FRONT, 'src/index.css'))};
import ${JSON.stringify(path.join(FRONT, 'src/index.scss'))};
// Invalid mock marker for this loopback fixture only. It grants no application
// access; it merely lets the real BillingLockProvider exercise the fake API.
if(window.location.origin===${JSON.stringify(APP)}){localStorage.setItem('token','local-browser-qa-not-a-credential');localStorage.setItem('role','Admin')}
createRoot(document.getElementById('root')).render(<BrowserRouter><ScreenSizeProvider><BillingLockProvider><ToastProvider>
<Routes><Route path='/AdminStack/PlanUsage' element={<PlanUsageScreen/>}/><Route path='/AdminStack/PlansPricing' element={<PlansPricingScreen/>}/><Route path='*' element={<Navigate to='/AdminStack/PlanUsage' replace/>}/></Routes>
</ToastProvider></BillingLockProvider></ScreenSizeProvider></BrowserRouter>);
`;
fs.writeFileSync(path.join(work, 'entry.jsx'), entry);
fs.writeFileSync(path.join(work, 'navigation.js'), `export const AdminStackName='/AdminStack';export const MainScreenName='/MainScreen';export const getNavBarData=()=>({NavBarLinks:[]});export default function Toolbar(){return null}`);
process.env.NODE_ENV = 'development';
const replacement = new webpack.NormalModuleReplacementPlugin(/(?:navigation\/AdminStack|screens\/mainScreen\/MainScreen|\.\.\/mainScreen\/MainScreen|navBars\/data\/NavBarData|navBars\/topToolBarSmallScreen\/TopToolBarSmallScreen)$/, resource => {
    resource.request = path.join(work, 'navigation.js');
});
webpack({ mode: 'development', devtool: false, context: FRONT, entry: path.join(work, 'entry.jsx'),
    output: { path: path.join(work, 'bundle'), filename: 'app.js', publicPath: '/' }, cache: false,
    resolve: { extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'], modules: [DEPS, 'node_modules'],
        alias: { 'react-router/dom': path.join(DEPS, 'react-router/dist/development/dom-export.js') } },
    resolveLoader: { modules: [DEPS] },
    plugins: [replacement, new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'development',
        REACT_APP_API_BASE_URL: APP + '/api', REACT_APP_DEFAULT_LANG: 'he' }) })],
    module: { rules: [
        { test: /\.[jt]sx?$/, exclude: /node_modules/, use: { loader: 'babel-loader', options: { babelrc: false, configFile: false, presets: [[path.join(DEPS, 'babel-preset-react-app'), { runtime: 'automatic' }]] } } },
        { test: /\.s?css$/, use: ['style-loader', 'css-loader', 'sass-loader'] },
        { test: /\.(png|jpg|jpeg|svg|gif|woff2?|ttf|eot)$/, type: 'asset/resource' },
    ] },
}, (error, stats) => {
    if (error || stats.hasErrors()) { console.error(error || stats.toString({ all: false, errors: true })); process.exitCode = 1; return; }
    console.log('BUILT actual billing screens', stats.hash);
    start();
});

const html = `<!doctype html><html lang='he' dir='rtl'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>
<title>Local billing browser QA</title><style>body{margin:0;font-family:Arial}#qa{position:sticky;top:0;z-index:100000;background:#152c44;color:white;padding:8px;direction:ltr;font:13px monospace}#qa button,#qa select{font:13px Arial;margin:2px;padding:5px}#qa-state{white-space:pre-wrap;max-height:100px;overflow:auto}#root{height:calc(100vh - 146px)}.lw-toast-viewport{z-index:999999}</style></head>
<body><aside id='qa'><strong>LOCAL QA — actual screens, synthetic API + iframe; no credentials or provider I/O</strong><br>
<label>Scenario <select id='scenario'><option>success</option><option>decline</option><option>unknown</option><option>no-debt</option></select></label>
<button id='reset'>Reset scenario</button><button id='plan'>PlanUsage screen</button><button id='pricing'>PlansPricing screen</button><button id='spoof'>Send forged parent message</button>
<div id='qa-summary' aria-label='Synthetic payment and access status'></div><pre id='qa-state' aria-label='Synthetic API counters'></pre></aside><div id='root'></div><script>
const q=s=>document.querySelector(s);q('#reset').onclick=async()=>{await fetch('/__qa/reset?scenario='+q('#scenario').value,{method:'POST'});location.href='/AdminStack/PlanUsage'};
q('#plan').onclick=()=>location.href='/AdminStack/PlanUsage';q('#pricing').onclick=()=>location.href='/AdminStack/PlansPricing';
q('#spoof').onclick=()=>window.postMessage({message:'paymentreplay',value:{InternalCode:0}},location.origin);
let initialScenarioSynced=false;setInterval(async()=>{let s=await fetch('/__qa/state').then(r=>r.json());if(!initialScenarioSynced){q('#scenario').value=s.scenario;initialScenarioSynced=true}q('#qa-summary').textContent='scenario='+s.scenario+' | status='+s.accountStatus+' | due='+s.collectibleDebt+' | savedCard='+s.savedCard+' | paid='+s.paid+' | pending='+s.pending+' | checkouts='+s.checkouts+' | confirmations='+s.confirmations+' | verificationFee='+s.fee+' | simulatedSubscriptionCharges='+s.subscriptionCharges;q('#qa-state').textContent=JSON.stringify(s,null,1)},300);
</script><script src='/app.js'></script></body></html>`;
function start() {
    const app = http.createServer(async (request, res) => {
        try {
            const url = new URL(request.url, APP);
            res.setHeader('Content-Security-Policy', `default-src 'self';script-src 'self' 'unsafe-inline';style-src 'self' 'unsafe-inline';img-src 'self' data:;font-src 'self' data:;connect-src 'self';frame-src ${GATEWAY};object-src 'none'`);
            if (url.pathname === '/__qa/state') return json(res, { ...state, accountStatus: plan().billing.status,
                collectibleDebt: state.scenario === 'no-debt' || state.paid ? 0 : 1353, completed: Object.keys(state.completed) });
            if (url.pathname === '/__qa/reset' && request.method === 'POST') { reset(url.searchParams.get('scenario') || 'success'); return json(res, { ok: true }); }
            if (url.pathname.startsWith('/api/')) {
                const input = request.method === 'POST' ? await body(request) : {};
                state.calls.push({ method: request.method, path: url.pathname });
                if (url.pathname === '/api/billing/plan' || url.pathname === '/api/billing/plans') return json(res, plan());
                if (url.pathname === '/api/billing/usage') return json(res, { documentsThisMonth: 0, storageBytesTotal: 0, seatsUsed: 1, smsThisMonth: 0 });
                if (url.pathname === '/api/billing/lock-status') return json(res, { canManageBilling: true, ...plan().billing });
                if (url.pathname === '/api/billing/system-message-consent') return json(res, { available: false });
                if (url.pathname === '/api/billing/checkout' || url.pathname === '/api/billing/package') {
                    state.checkouts++;
                    const identity = { intentId: 'synthetic-intent-' + state.checkouts, uniqId: 'synthetic-order-' + state.checkouts,
                        redirectUrl: GATEWAY + '/checkout/' + state.checkouts, amount: 1, kind: 'setup' };
                    return json(res, url.pathname.endsWith('/package') ? { saved: true, charged: false, checkout: identity } : identity);
                }
                if (url.pathname === '/api/billing/checkout/confirm') {
                    state.confirmations++; state.confirmBodies.push(input);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const valid = /^synthetic-intent-\d+$/.test(input.intentId || '') && /^synthetic-order-\d+$/.test(input.uniqId || '');
                    if (!valid) return json(res, { success: false }, 400);
                    if (!state.completed[input.intentId]) {
                        state.completed[input.intentId] = true; state.fee++; state.savedCard = true;
                        state.paid = state.scenario === 'success'; state.pending = state.scenario === 'unknown';
                        if (state.paid) state.subscriptionCharges++;
                    }
                    return json(res, { success: state.paid || state.scenario === 'no-debt', cardVerified: true, ...plan() });
                }
                if (url.pathname === '/api/billing/charge') return json(res, { ok: false, pending: state.pending, charged: false, snapshot: plan().billing });
                return json(res, { error: 'UNIMPLEMENTED_SYNTHETIC_API' }, 404);
            }
            const file = path.join(work, 'bundle', path.basename(url.pathname));
            if (fs.existsSync(file) && fs.statSync(file).isFile()) {
                res.writeHead(200, { 'Content-Type': url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream' });
                return fs.createReadStream(file).pipe(res);
            }
            res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html);
        } catch (error) { json(res, { error: String(error.message) }, 500); }
    });
    const gateway = http.createServer((request, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': `default-src 'none';script-src 'unsafe-inline';style-src 'unsafe-inline';frame-ancestors ${APP}` });
        res.end(`<!doctype html><html dir='rtl'><meta charset='utf-8'><style>body{font:20px Arial;padding:30px;background:#eef4ff}button{padding:14px;margin:10px;font:18px Arial}</style><h2>מסגרת תקבול מדומה — בדיקה מקומית בלבד</h2><p>אין כרטיס, תשלום או מסמך אמיתי. התוצאה נקבעת לפי תרחיש הבדיקה.</p><button id='approve'>אשר אימות כרטיס מדומה</button><button id='repeat'>שלח אישור כפול מדומה</button><script>let msg={message:'paymentreplay',value:{InternalCode:0}};document.querySelector('#approve').onclick=()=>parent.postMessage(msg,${JSON.stringify(APP)});document.querySelector('#repeat').onclick=()=>{for(let i=0;i<3;i++)parent.postMessage(msg,${JSON.stringify(APP)})};</script></html>`);
    });
    app.listen(55701, '127.0.0.1', () => console.log('APP ' + APP));
    gateway.listen(55702, '127.0.0.1', () => console.log('IFRAME ' + GATEWAY));
    const stop = () => { app.close(); gateway.close(); setTimeout(() => process.exit(0), 50); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    console.log('BUNDLE ' + work);
}
