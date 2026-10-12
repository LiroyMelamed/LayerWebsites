const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontend = path.resolve(__dirname, '../..');
const files = process.env.SIGNING_HTML_FILES
  ? JSON.parse(process.env.SIGNING_HTML_FILES)
  : ['public/index.html', ...['melamedlaw', 'morlevy', 'ashrafessa', 'idm', 'melamedia', 'lawyer']
    .map(tenant => `public/tenants/${tenant}/index.html`)].map(file => path.join(frontend, file));
const agents = {
  Android: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
  iPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
};

function runPage(file, route, userAgent, storage = {}) {
  const html = fs.readFileSync(file, 'utf8');
  const frames = [], timers = [], banners = [], values = { ...storage };
  const location = new URL(route, 'https://example.invalid');
  const parent = { appendChild(el) { el.parentNode = parent; if (el.tag === 'iframe') frames.push(el.src); if (el.id) banners.push(el.id); }, removeChild() {} };
  const document = {
    hidden: false, body: parent, documentElement: parent,
    createElement(tag) { return { tag, style: {}, setAttribute() {}, appendChild() {} }; },
    addEventListener() {}, removeEventListener() {}, getElementById() { return null; },
  };
  const context = {
    window: { location }, document, navigator: { userAgent }, URL,
    sessionStorage: { getItem(key) { return values[key] || null; }, setItem(key, value) { values[key] = value; } },
    setTimeout(callback) { timers.push(callback); },
  };
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=|application\/ld\+json/i.test(match[1])) continue;
    if (!match[2].trim()) continue;
    vm.runInNewContext(match[2], context, { timeout: 1000, filename: file });
  }
  for (let i = 0; i < timers.length; i++) {
    assert.ok(i < 30, 'bootstrap timers must terminate');
    timers[i]();
  }
  return { frames, banners, location: location.href, values, html };
}

for (const file of files) {
  const label = path.relative(frontend, file);
  for (const [device, userAgent] of Object.entries(agents)) {
    test(`${label}: ${device} public signing stays in browser without a registered app`, () => {
      for (const route of ['/s/Abcd_123', '/PublicSignScreen?token=synthetic-only', '/ViewSignedDocument/Sign#synthetic-only', '/ViewSignedDocument/Package?batch=synthetic-only', '/ViewSignedDocument?token=synthetic-only']) {
        const result = runPage(file, route, userAgent);
        assert.deepEqual(result.frames, [], route + ': must not attempt an app scheme');
        assert.deepEqual(result.banners, [], route + ': must not divert to an app store');
        assert.equal(result.location, new URL(route, 'https://example.invalid').href, 'preserve full token/query/fragment');
      }
    });
  }
  test(`${label}: existing web/app preference and unrelated home behavior are preserved`, () => {
    for (const route of ['/s/Abcd_123?web=1', '/PublicSignScreen?fromApp=true&token=synthetic-only']) {
      assert.deepEqual(runPage(file, route, agents.Android).frames, []);
    }
    assert.deepEqual(runPage(file, '/', agents.Android, { lw_prefer_web: '1' }).frames, []);
    const home = runPage(file, '/', agents.Android);
    if (home.html.includes('iframe')) assert.ok(home.frames.length > 0, 'existing home app prompt must remain available');
    else assert.deepEqual(home.frames, []);
  });
}
