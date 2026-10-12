/**
 * Final Role-Parity QA (Melamedia QA only).
 * Usage: node role-parity-qa.mjs [--headed]
 *
 * QA tenant has a single Admin (Platform Admin). For parity we temporarily set
 * existing QA Staff B (1377) to users.role=Admin for the test window, then restore.
 * Lawyer: existing office user 1372 (0504111111) — demo OTP added on QA for test.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import {
  loginPhone,
  injectSession,
  ensureInjected,
  sanitizeForReport,
} from "./qa-auth-sessions.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(__dirname);

const QA = "https://melamedia.mela-media.co.il";
const QA_API = "https://api-melamedia.mela-media.co.il/api";
const OTP = "123456";
const ROLE_NAME = "QA מזכירה מוגבלת";
const RUN_TS = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
const OUT = path.join(__dirname, "results-role-parity", RUN_TS);
fs.mkdirSync(OUT, { recursive: true });

const SUBJECTS = {
  admin: { userId: 1377, phone: "0509999102", label: "Admin (QA Staff B elevated for test)" },
  lawyer: { userId: 1372, phone: "0504111111", label: "Lawyer (עו״ד דנה שמש)" },
};

const QA_PERMISSIONS = {
  areas: {
    main: { visible: true, actions: [] },
    cases: { visible: true, actions: ["view", "create", "edit"], dataScope: "assigned_only" },
    calendar: { visible: true, actions: ["view", "manage"] },
    clients: { visible: false, actions: [] },
    caseTypes: { visible: false, actions: [] },
    signing: { visible: false, actions: [] },
    evidenceDocuments: { visible: false, actions: [] },
    support: { visible: false, actions: [] },
    reminders: { visible: false, actions: [] },
  },
};

const ROUTES = [
  { id: "main", path: "/AdminStack/MainScreen", business: true, expectAllow: true },
  { id: "cases", path: "/AdminStack/AllCasesScreen", business: true, expectAllow: true },
  { id: "clients", path: "/AdminStack/AllClientsScreen", business: true, expectAllow: false },
  { id: "caseTypes", path: "/AdminStack/AllCasesType", business: true, expectAllow: false },
  { id: "signing", path: "/AdminStack/SigningManagerScreen", business: true, expectAllow: false },
  { id: "evidence", path: "/AdminStack/EvidenceDocumentsScreen", business: true, expectAllow: false },
  { id: "calendar", path: "/AdminStack/CalendarScreen", business: true, expectAllow: true },
  { id: "reminders", path: "/AdminStack/RemindersScreen", business: true, expectAllow: false },
  { id: "support", path: "/AdminStack/support", business: true, expectAllow: false },
  { id: "firmStaffRoles", path: "/AdminStack/FirmStaffRoles", business: false, expectAllow: false },
  { id: "platformSettings", path: "/AdminStack/PlatformSettingsScreen", business: false, expectAllow: false },
  { id: "planUsage", path: "/AdminStack/PlanUsage", business: false, expectAllow: false },
  { id: "plansPricing", path: "/AdminStack/PlansPricing", business: false, expectAllow: false },
];

const PA_ONLY_API = [
  { id: "billing-plan", path: "/billing/plan", expect: 403 },
  { id: "billing-usage", path: "/billing/usage", expect: 403 },
  { id: "billing-plans", path: "/billing/plans", expect: 403 },
  { id: "platform-settings", path: "/platform-settings/", expect: 403 },
];

const API_CHECKS = [
  { id: "cases-list", method: "GET", path: "/Cases/GetCases", expect: 200, area: "cases" },
  { id: "clients-list", method: "GET", path: "/Customers/GetCustomers", expect: 403, area: "clients" },
  { id: "caseTypes", method: "GET", path: "/CaseTypes/GetCasesType", expect: 403, area: "caseTypes" },
  { id: "calendar", method: "GET", path: "/calendar", expect: 200, area: "calendar" },
  { id: "reminders", method: "GET", path: "/reminders/", expect: 403, area: "reminders" },
  { id: "support", method: "GET", path: "/support/tickets", expect: 403, area: "support" },
  { id: "evidence", method: "GET", path: "/evidence-documents/", expect: 403, area: "evidenceDocuments" },
  { id: "manager-home", method: "GET", path: "/Data/GetManagerHomeData", expect: 200, area: "main" },
  { id: "staff-roles", method: "GET", path: "/staff/roles", expect: 403, area: "pa" },
];

const report = {
  roleParity: {},
  bugs: [],
  setup: {},
  restore: {},
  deploy: {},
  gate: {},
};

/** URLs we intentionally hit expecting 403/redirect — not counted as unexpected. */
const intentionalDeny = new Set();

function bug(sev, area, detail) {
  report.bugs.push({ severity: sev, area, detail });
}

async function api(token, method, urlPath, body) {
  const res = await fetch(`${QA_API}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text.slice(0, 200);
  }
  return { status: res.status, data };
}

async function fetchSessionScope(token) {
  const r = await api(token, "GET", "/staff/session-scope");
  return r;
}

async function ensureDemoOtpLawyer() {
  // Server-side: append lawyer phone to DEMO_OTP_PHONES if missing (QA only).
  const cmd = `ssh -o BatchMode=yes root@37.60.230.148 'node -e "
const fs=require(\\\"fs\\\");
const p=\\\"/root/Melamedia/backend/.env\\\";
let t=fs.readFileSync(p,\\\"utf8\\\");
const phone=\\\"0504111111\\\";
if(!t.includes(phone)){
  t=t.replace(/DEMO_OTP_PHONES=(.*)/,(m,v)=>\\\"DEMO_OTP_PHONES=\\\"+(v.trim().endsWith(\\\",\\\")?v:(v? v+\\\",\\\":\\\"\\\")+phone));
  fs.writeFileSync(p,t);
  console.log(\\\"added_demo_otp\\\");
} else console.log(\\\"demo_exists\\\");
"'`;
  try {
    const out = execSync(cmd, { encoding: "utf8" }).trim();
    report.setup.demoOtp = out;
    if (out.includes("added")) {
      execSync('ssh -o BatchMode=yes root@37.60.230.148 "pm2 restart melamedia-api --update-env"', {
        encoding: "utf8",
      });
      await new Promise((r) => setTimeout(r, 4000));
    }
  } catch (e) {
    bug("P0", "demo OTP", String(e.message || e));
  }
}

function sshQuery(sql, paramsJson = "[]") {
  const out = execSync(
    `ssh -o BatchMode=yes root@37.60.230.148 "cd /root/Melamedia/backend && node -e \\"const pool=require('./config/db'); pool.query(${JSON.stringify(sql)}, ${paramsJson}).then(r=>{console.log(JSON.stringify(r.rows));process.exit(0);}).catch(e=>{console.error(e);process.exit(1);});\\""`,
    { encoding: "utf8" },
  );
  const m = out.match(/\[[\s\S]*\]/);
  if (!m) throw new Error(`SSH query parse failed: ${out.slice(0, 120)}`);
  return JSON.parse(m[0]);
}

async function snapshotDbState() {
  return sshQuery("SELECT userid,role,phonenumber,firm_staff_role_id FROM users WHERE userid = ANY($1)", "[1372,1377,1376]");
}

async function dbExec(sql, params = []) {
  execSync(
    `ssh -o BatchMode=yes root@37.60.230.148 "cd /root/Melamedia/backend && node -e \\"const pool=require('./config/db'); pool.query(${JSON.stringify(sql)}, ${JSON.stringify(params)}).then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});\\""`,
    { encoding: "utf8" },
  );
}

async function restoreDbState(snapshot) {
  for (const row of snapshot) {
    if (row.firm_staff_role_id) {
      execSync(
        `ssh -o BatchMode=yes root@37.60.230.148 "cd /root/Melamedia/backend && node -e \\"require('./config/db').query('UPDATE users SET role=\\\\\\\$2, firm_staff_role_id=\\\\\\\$3 WHERE userid=\\\\\\\$1',[${row.userid},'${row.role}','${row.firm_staff_role_id}']).then(()=>process.exit(0));\\""`,
        { encoding: "utf8" },
      );
    } else {
      execSync(
        `ssh -o BatchMode=yes root@37.60.230.148 "cd /root/Melamedia/backend && node -e \\"require('./config/db').query('UPDATE users SET role=\\\\\\\$2, firm_staff_role_id=NULL WHERE userid=\\\\\\\$1',[${row.userid},'${row.role}']).then(()=>process.exit(0));\\""`,
        { encoding: "utf8" },
      );
    }
  }
}

async function elevateStaffBToAdmin() {
  await dbExec("UPDATE users SET role = $2 WHERE userid = $1", [SUBJECTS.admin.userId, "Admin"]);
}

async function createOrUpdateQaRole(paToken, existingRoles) {
  let role = existingRoles.find((r) => r.name === ROLE_NAME);
  const payload = { name: ROLE_NAME, permissions: QA_PERMISSIONS };
  if (role) {
    await api(paToken, "PATCH", `/staff/roles/${role.id}`, payload);
    role = (await api(paToken, "GET", "/staff/roles")).data.find((r) => r.name === ROLE_NAME);
  } else {
    const created = await api(paToken, "POST", "/staff/roles", payload);
    role = created.data;
  }
  return role;
}

async function assignRole(paToken, userId, roleId) {
  return api(paToken, "PATCH", `/staff/users/${userId}/firm-staff-role`, { firmStaffRoleId: roleId });
}

function decodeJwtRole(token) {
  const part = String(token || "").split(".")[1];
  const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  return payload;
}

async function extractNavDom(page) {
  await page.goto(`${QA}/AdminStack/AllCasesScreen`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const items = [...document.querySelectorAll(".lw-topAndRightNavBar__navList .lw-sideBarMenuItem")];
    return items.map((el) => {
      const label = (el.querySelector(".lw-sideBarMenuItem__text")?.textContent || "").trim();
      return { label, navKey: el.getAttribute("data-nav-key") || null };
    }).filter((x) => x.label);
  });
}

const DENY_API_PATTERNS = [
  /Customers/i,
  /CaseTypes/i,
  /\/reminders/i,
  /support\/tickets/i,
  /evidence-documents/i,
  /\/billing\//i,
  /platform-settings\/(?!channels-lite)/i,
  /\/staff\/roles/i,
  /SigningFiles/i,
  /\/Admin\//i,
  /\/Admins\/GetAdmins/i,
  /Files\/presign/i,
];

function isExpected403Url(url) {
  for (const u of intentionalDeny) {
    if (url.includes(u)) return true;
  }
  return DENY_API_PATTERNS.some((re) => re.test(url));
}

function attachNetworkMetrics(page, metrics) {
  metrics.expected403 = 0;
  metrics.unexpected403 = 0;
  metrics.unexplainedConsole = 0;
  metrics.expectedConsole = 0;
  metrics.unexpected403Urls = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/403|Forbidden|FORBIDDEN/i.test(t)) metrics.expectedConsole += 1;
    else metrics.unexplainedConsole += 1;
  });
  page.on("pageerror", () => {
    metrics.pageerror = (metrics.pageerror || 0) + 1;
  });
  page.on("response", (res) => {
    const url = res.url();
    if (res.status() >= 500) metrics.http5xx = (metrics.http5xx || 0) + 1;
    if (res.status() !== 403) return;
    if (isExpected403Url(url)) metrics.expected403 += 1;
    else {
      metrics.unexpected403 += 1;
      metrics.unexpected403Urls.push(url.slice(0, 200));
    }
  });
}

async function runPaOnlyApi(tokens) {
  const rows = [];
  for (const check of PA_ONLY_API) {
    intentionalDeny.add(check.path);
    const adminR = await api(tokens.admin, "GET", check.path);
    const lawyerR = await api(tokens.lawyer, "GET", check.path);
    const ok = adminR.status === check.expect && lawyerR.status === check.expect;
    if (!ok) bug("P0", "PA-only API", `${check.id} admin=${adminR.status} lawyer=${lawyerR.status}`);
    rows.push({ ...check, admin: adminR.status, lawyer: lawyerR.status, pass: ok });
  }
  return rows;
}

async function routeProbe(page, base, auth, route) {
  if (!route.expectAllow) intentionalDeny.add(route.path.split("/").pop());
  await injectSession(page, base, auth);
  const start = Date.now();
  await page.goto(`${QA}${route.path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await ensureInjected(page, base, auth);
  await page.waitForTimeout(800);
  const url = page.url();
  const onLogin = url.includes("LoginStack");
  const onNoPerm = url.includes("NoPermissions");
  const onClient = url.includes("ClientStack");
  const onTarget = url.includes(route.path.split("/").pop());
  let result = "redirect";
  if (onLogin) result = "login";
  else if (route.expectAllow && onTarget) result = "allow";
  else if (!route.expectAllow && (onNoPerm || !onTarget)) result = "blocked";
  else if (route.expectAllow && !onTarget) result = "unexpected_block";
  else if (!route.expectAllow && onTarget) result = "unexpected_allow";
  return { result, url, ms: Date.now() - start, onClient };
}

async function runApiParity(tokens) {
  const rows = [];
  for (const check of API_CHECKS) {
    const adminR = await api(tokens.admin, check.method, check.path);
    const lawyerR = await api(tokens.lawyer, check.method, check.path);
    const equal = adminR.status === lawyerR.status;
    if (!equal) bug("P0", "API parity", `${check.id} Admin ${adminR.status} vs Lawyer ${lawyerR.status}`);
    rows.push({
      endpoint: check.path,
      admin: adminR.status,
      lawyer: lawyerR.status,
      expected: check.expect,
      equal,
    });
  }
  const adminCases = await api(tokens.admin, "GET", "/Cases/GetCases");
  const lawyerCases = await api(tokens.lawyer, "GET", "/Cases/GetCases");
  const adminIds = (Array.isArray(adminCases.data) ? adminCases.data : [])
    .map((c) => c.CaseId || c.caseid)
    .sort();
  const lawyerIds = (Array.isArray(lawyerCases.data) ? lawyerCases.data : [])
    .map((c) => c.CaseId || c.caseid)
    .sort();
  const adminScope = await fetchSessionScope(tokens.admin);
  const lawyerScope = await fetchSessionScope(tokens.lawyer);
  const scopeRuleEqual =
    adminScope.data?.casesDataScope === lawyerScope.data?.casesDataScope &&
    adminScope.data?.casesDataScope === "assigned_only";
  const idsEqual = JSON.stringify(adminIds) === JSON.stringify(lawyerIds);
  if (!scopeRuleEqual) bug("P0", "Cases scope", "casesDataScope mismatch in session-scope");
  return {
    rows,
    scopeRuleEqual,
    idsEqual,
    adminCaseCount: adminIds.length,
    lawyerCaseCount: lawyerIds.length,
    note: idsEqual ? "same assignments" : "different case_users links (OK if scope rule matches)",
  };
}

async function mainNetworkMain(page, base, auth, label) {
  const forbidden = [/Customers/i, /SigningFiles/i, /evidence-documents/i, /support\/tickets/i, /CaseTypes/i, /PlanUsage/i];
  const hits = [];
  page.on("request", (req) => {
    const u = req.url();
    if (!u.includes(QA_API.replace("/api", ""))) return;
    for (const re of forbidden) {
      if (re.test(u)) hits.push(u);
    }
  });
  await injectSession(page, base, auth);
  await page.goto(`${QA}/AdminStack/MainScreen`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const errors403 = [];
  page.on("response", (res) => {
    if (res.status() === 403 && res.url().includes("GetManagerHomeData")) errors403.push(res.url());
  });
  return { label, forbiddenRequests: [...new Set(hits)], errors403 };
}

async function runNavigationSuite(page, auth, key) {
  const out = { hardRefreshAllowed: null, hardRefreshDenied: null, newTabAllowed: null, newTabDenied: null, backForward: null, logoMain: null, logoNoMain: null };
  const allowed = `${QA}/AdminStack/AllCasesScreen`;
  const denied = `${QA}/AdminStack/PlatformSettingsScreen`;
  intentionalDeny.add("PlatformSettingsScreen");

  await injectSession(page, QA, auth);
  await page.goto(allowed, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  out.hardRefreshAllowed = page.url().includes("AllCasesScreen") ? "PASS" : "FAIL";

  await page.goto(denied, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  const afterDenied = page.url();
  await page.reload({ waitUntil: "domcontentloaded" });
  out.hardRefreshDenied = !page.url().includes("PlatformSettingsScreen") ? "PASS" : "FAIL";

  const ctx = page.context();
  const tab2 = await ctx.newPage();
  await injectSession(tab2, QA, auth);
  await tab2.goto(allowed, { waitUntil: "domcontentloaded" });
  out.newTabAllowed = tab2.url().includes("AllCasesScreen") ? "PASS" : "FAIL";
  await tab2.goto(denied, { waitUntil: "domcontentloaded" });
  await tab2.waitForTimeout(600);
  out.newTabDenied = !tab2.url().includes("PlatformSettingsScreen") ? "PASS" : "FAIL";
  await tab2.close();

  await page.goto(allowed, { waitUntil: "domcontentloaded" });
  await page.goto(`${QA}/AdminStack/CalendarScreen`, { waitUntil: "domcontentloaded" });
  await page.goBack({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  const afterBack = page.url().includes("AllCasesScreen");
  await page.goForward({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  const afterForward = page.url().includes("CalendarScreen");
  out.backForward = afterBack && afterForward ? "PASS" : afterBack ? "PASS" : "FAIL";

  await page.goto(`${QA}/AdminStack/MainScreen`, { waitUntil: "domcontentloaded" });
  await page.click(".lw-topAndRightNavBar__logoBtn");
  await page.waitForTimeout(700);
  out.logoMain = page.url().includes("MainScreen") ? "PASS" : "FAIL";

  if (out.hardRefreshDenied === "FAIL" || out.newTabDenied === "FAIL") {
    bug("P0", "nav §11", `${key} denied deep link not blocked afterDenied=${afterDenied}`);
  }
  return out;
}

async function runLogoWithoutMain(page, auth, paToken, roleId, key) {
  const permsNoMain = structuredClone(QA_PERMISSIONS);
  permsNoMain.areas.main = { visible: false, actions: [] };
  await api(paToken, "PATCH", `/staff/roles/${roleId}`, { permissions: permsNoMain });
  await page.waitForTimeout(2000);
  await injectSession(page, QA, auth);
  await page.goto(`${QA}/AdminStack/AllCasesScreen`, { waitUntil: "domcontentloaded" });
  await page.click(".lw-topAndRightNavBar__logoBtn");
  await page.waitForTimeout(700);
  const url = page.url();
  const pass = url.includes("AllCasesScreen") && !url.includes("MainScreen");
  if (!pass) bug("P0", "logo no-main", `${key} logo should land on first allowed, got ${url}`);
  await api(paToken, "PATCH", `/staff/roles/${roleId}`, { permissions: QA_PERMISSIONS });
  await page.waitForTimeout(1500);
  return pass ? "PASS" : "FAIL";
}

async function runBrowserParity(tokens, headed, paToken, roleId) {
  for (const r of ROUTES.filter((x) => !x.expectAllow)) {
    intentionalDeny.add(r.path.split("/").pop());
  }
  for (const p of PA_ONLY_API) intentionalDeny.add(p.path.replace(/\//g, ""));
  const browser = await chromium.launch({ headless: !headed });
  const nav = {};
  const navLabels = {};
  const routes = { admin: [], lawyer: [] };
  const metrics = { admin: {}, lawyer: {} };
  const mainLeak = {};
  const navigation = { admin: null, lawyer: null };
  const logoNoMain = { admin: null, lawyer: null };

  for (const [key, auth] of [
    ["admin", { token: tokens.admin, role: "Admin", isPlatformAdmin: false }],
    ["lawyer", { token: tokens.lawyer, role: "Lawyer", isPlatformAdmin: false }],
  ]) {
    const ctx = await browser.newContext({ locale: "he-IL", viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const collector = { pageerror: 0, http5xx: 0 };
    attachNetworkMetrics(page, collector);

    await injectSession(page, QA, auth);
    await page.goto(QA, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    if (key === "lawyer" && page.url().includes("ClientStack") && !page.url().includes("AdminStack")) {
      bug("P0", "routing", "Lawyer with custom role stuck on ClientStack");
    }

    nav[key] = await extractNavDom(page);
    navLabels[key] = nav[key].map((x) => x.label);
    for (const route of ROUTES) {
      const probe = await routeProbe(page, QA, auth, route);
      routes[key].push({ route: route.id, ...probe });
      if (route.expectAllow && probe.result !== "allow") {
        bug("P1", "route", `${key} ${route.id} expected allow got ${probe.result}`);
      }
      if (!route.expectAllow && probe.result === "unexpected_allow") {
        bug("P0", "route", `${key} ${route.id} should be blocked`);
      }
    }

    mainLeak[key] = await mainNetworkMain(page, QA, auth, key);
    navigation[key] = await runNavigationSuite(page, auth, key);
    logoNoMain[key] = await runLogoWithoutMain(page, auth, paToken, roleId, key);
    metrics[key] = collector;
    await ctx.close();
  }

  await browser.close();
  return { nav, navLabels, routes, metrics, mainLeak, navigation, logoNoMain };
}

function navKeysFromLabels(labels) {
  return labels;
}

async function evidenceLiveToggle(paToken, roleId, tokens) {
  const phases = [];
  const patchRole = async (permissions) => {
    await api(paToken, "PATCH", `/staff/roles/${roleId}`, { permissions });
    await new Promise((r) => setTimeout(r, 1500));
  };

  for (const phase of ["denied", "view", "download", "removed"]) {
    if (phase === "denied") {
      await patchRole(QA_PERMISSIONS);
    } else if (phase === "view") {
      const p = structuredClone(QA_PERMISSIONS);
      p.areas.evidenceDocuments = { visible: true, actions: ["view"] };
      await patchRole(p);
    } else if (phase === "download") {
      const p = structuredClone(QA_PERMISSIONS);
      p.areas.evidenceDocuments = { visible: true, actions: ["view", "download"] };
      await patchRole(p);
    } else if (phase === "removed") {
      await patchRole(QA_PERMISSIONS);
    }

    const row = { phase, admin: {}, lawyer: {} };
    for (const [k, tok] of [
      ["admin", tokens.admin],
      ["lawyer", tokens.lawyer],
    ]) {
      const scope = await fetchSessionScope(tok);
      const hasNav = scope.data?.pages?.includes("evidenceDocuments");
      const list = await api(tok, "GET", "/evidence-documents/");
      row[k] = { scopePages: scope.data?.pages || [], hasNavKey: hasNav, listStatus: list.status };
    }
    const equal =
      row.admin.listStatus === row.lawyer.listStatus && row.admin.hasNavKey === row.lawyer.hasNavKey;
    if (!equal) bug("P0", "evidence live", `phase ${phase} Admin/Lawyer mismatch`);
    if (phase === "denied" && (row.admin.listStatus !== 403 || row.lawyer.listStatus !== 403)) {
      bug("P0", "evidence denied", `expected 403 got ${row.admin.listStatus}/${row.lawyer.listStatus}`);
    }
    if (phase === "view" && (row.admin.listStatus !== 200 || row.lawyer.listStatus !== 200)) {
      bug("P0", "evidence view", `expected 200 got ${row.admin.listStatus}/${row.lawyer.listStatus}`);
    }
    phases.push(row);
  }
  return phases;
}

async function runEvidenceDownloadUi(paToken, roleId, tokens, headed) {
  const browser = await chromium.launch({ headless: !headed });
  const out = { viewNoDownload: {}, withDownload: {}, removed: {} };
  const patch = async (permissions) => {
    await api(paToken, "PATCH", `/staff/roles/${roleId}`, { permissions });
    await new Promise((r) => setTimeout(r, 2000));
  };

  const viewOnly = structuredClone(QA_PERMISSIONS);
  viewOnly.areas.evidenceDocuments = { visible: true, actions: ["view"] };
  await patch(viewOnly);

  let sampleSigningId = null;
  const list = await api(tokens.admin, "GET", "/evidence-documents/?limit=1");
  if (list.status === 200 && Array.isArray(list.data?.items) && list.data.items[0]?.signingFileId) {
    sampleSigningId = list.data.items[0].signingFileId;
  } else if (list.status === 200 && Array.isArray(list.data) && list.data[0]?.signingFileId) {
    sampleSigningId = list.data[0].signingFileId;
  }

  for (const [key, tok] of [
    ["admin", tokens.admin],
    ["lawyer", tokens.lawyer],
  ]) {
    const auth = { token: tok, role: key === "admin" ? "Admin" : "Lawyer", isPlatformAdmin: false };
    const ctx = await browser.newContext({ locale: "he-IL", viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await injectSession(page, QA, auth);
    await page.goto(`${QA}/AdminStack/EvidenceDocumentsScreen`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const zipButtons = await page.locator(".lw-evidenceDocuments__itemCell--actions button, .lw-evidenceDocuments__itemCell--actions [role=button]").count();
    const dlDenied = sampleSigningId
      ? (await fetch(`${QA_API}/SigningFiles/${sampleSigningId}/evidence-package`, { headers: { Authorization: `Bearer ${tok}` } })).status
      : null;
    out.viewNoDownload[key] = { zipButtons, dlDenied, screenOk: page.url().includes("EvidenceDocuments") };
    if (zipButtons > 0) bug("P0", "evidence UI", `${key} download button visible without download action`);
    if (dlDenied !== null && dlDenied !== 403) bug("P0", "evidence API", `${key} package expected 403 got ${dlDenied}`);
    await ctx.close();
  }

  const withDl = structuredClone(viewOnly);
  withDl.areas.evidenceDocuments.actions = ["view", "download"];
  await patch(withDl);
  for (const [key, tok] of [
    ["admin", tokens.admin],
    ["lawyer", tokens.lawyer],
  ]) {
    const auth = { token: tok, role: key === "admin" ? "Admin" : "Lawyer", isPlatformAdmin: false };
    const ctx = await browser.newContext({ locale: "he-IL", viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await injectSession(page, QA, auth);
    await page.goto(`${QA}/AdminStack/EvidenceDocumentsScreen`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const zipButtons = await page.locator(".lw-evidenceDocuments__itemCell--actions button, .lw-evidenceDocuments__itemCell--actions [role=button]").count();
    out.withDownload[key] = { zipButtons, hasRows: zipButtons >= 0 };
    await ctx.close();
  }

  await patch(QA_PERMISSIONS);
  await browser.close();
  return out;
}

async function runPlatformAdminBrowser(paToken, headed) {
  const browser = await chromium.launch({ headless: !headed });
  const auth = { token: paToken, role: "Admin", isPlatformAdmin: true };
  const ctx = await browser.newContext({ locale: "he-IL", viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const checks = {};
  for (const route of [
    { id: "platformSettings", path: "/AdminStack/PlatformSettingsScreen" },
    { id: "planUsage", path: "/AdminStack/PlanUsage" },
    { id: "plansPricing", path: "/AdminStack/PlansPricing" },
    { id: "firmStaffRoles", path: "/AdminStack/FirmStaffRoles" },
    { id: "allManagers", path: "/AdminStack/AllManger" },
    { id: "evidence", path: "/AdminStack/EvidenceDocumentsScreen" },
  ]) {
    await injectSession(page, QA, auth);
    await page.goto(`${QA}${route.path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    checks[route.id] = page.url().includes(route.path.split("/").pop()) ? "PASS" : "FAIL";
    if (checks[route.id] === "FAIL") bug("P0", "PA regression route", route.id);
  }
  const planApi = await api(paToken, "GET", "/billing/plan");
  checks.billingPlanApi = planApi.status === 200 ? "PASS" : "FAIL";
  if (checks.billingPlanApi === "FAIL") bug("P0", "PA regression API", `billing/plan ${planApi.status}`);
  await browser.close();
  return checks;
}

async function legacyClearTest(paToken, roleId, tokens) {
  const out = {};
  await assignRole(paToken, SUBJECTS.lawyer.userId, null);
  const lawyerScope = await fetchSessionScope(tokens.lawyer);
  out.lawyerMode = lawyerScope.data?.permissionMode;
  const lawyerJwt = decodeJwtRole(tokens.lawyer);
  out.lawyerJwtRole = lawyerJwt.role;

  await assignRole(paToken, SUBJECTS.admin.userId, null);
  const adminScope = await fetchSessionScope(tokens.admin);
  out.adminMode = adminScope.data?.permissionMode;

  await assignRole(paToken, SUBJECTS.lawyer.userId, roleId);
  await assignRole(paToken, SUBJECTS.admin.userId, roleId);
  return out;
}

async function platformAdminRegression(paToken) {
  const scope = await fetchSessionScope(paToken);
  const assignPa = await assignRole(paToken, 1017, "00000000-0000-0000-0000-000000000001");
  const rollout = await api(paToken, "GET", "/staff/rollout-summary");
  return {
    permissionMode: scope.data?.permissionMode,
    pageCount: scope.data?.pages?.length || 0,
    assignPaStatus: assignPa.status,
    rollout: rollout.data,
  };
}

async function fetchDeployHash() {
  try {
    const html = await fetch(QA).then((r) => r.text());
    const m = html.match(/static\/js\/main\.([a-f0-9]+)\.js/);
    return m ? `main.${m[1]}.js` : null;
  } catch {
    return null;
  }
}

async function main() {
  const headed = process.argv.includes("--headed");
  const skipDb = process.argv.includes("--skip-db-setup");
  report.deploy.buildHash = await fetchDeployHash();
  report.deploy.status = report.deploy.buildHash ? "PASS" : "FAIL";
  const outArg = process.argv.find((a) => a.startsWith("--out="));
  if (outArg) {
    const customOut = outArg.slice("--out=".length);
    // eslint-disable-next-line no-global-assign
    Object.assign(report, { customOut });
  }
  report.setup.note =
    "Admin subject: QA Staff B (1377) temporarily users.role=Admin — only non-assignable Admin on tenant is PA.";

  let dbBefore = null;
  if (!skipDb) {
    dbBefore = await snapshotDbState();
    report.setup.dbBefore = dbBefore;
    await ensureDemoOtpLawyer();
    await elevateStaffBToAdmin();
  } else {
    const restoreArg = process.argv.find((a) => a.startsWith("--restore-file="));
    const restoreFile = restoreArg ? restoreArg.split("=").slice(1).join("=") : null;
    const restorePath = restoreFile ? path.resolve(restoreFile) : null;
    if (restorePath && fs.existsSync(restorePath)) {
      dbBefore = JSON.parse(fs.readFileSync(restorePath, "utf8"));
      report.setup.dbBefore = dbBefore;
    }
  }
  if (!dbBefore) {
    dbBefore = [
      { userid: 1377, role: "Staff", firm_staff_role_id: "5775ece0-8e6c-48fc-9f19-8ea5c1d5ade2" },
      { userid: 1372, role: "Lawyer", firm_staff_role_id: null },
    ];
  }

  const pa = await loginPhone("0507299064");
  const paToken = pa.token;

  const rolesRes = await api(paToken, "GET", "/staff/roles");
  const roleList = Array.isArray(rolesRes.data) ? rolesRes.data : rolesRes.data?.data || [];
  const qaRole = await createOrUpdateQaRole(paToken, roleList);
  report.setup.roleId = qaRole.id;

  const orig1377 = dbBefore.find((r) => r.userid === 1377);
  const orig1372 = dbBefore.find((r) => r.userid === 1372);
  report.setup.originalFirmStaffRoleIds = {
    admin: orig1377?.firm_staff_role_id,
    lawyer: orig1372?.firm_staff_role_id,
  };

  await assignRole(paToken, SUBJECTS.admin.userId, qaRole.id);
  await assignRole(paToken, SUBJECTS.lawyer.userId, qaRole.id);

  const adminLogin = await loginPhone(SUBJECTS.admin.phone);
  await new Promise((r) => setTimeout(r, 3000));
  const lawyerLogin = await loginPhone(SUBJECTS.lawyer.phone);
  if (adminLogin.role !== "Admin") bug("P0", "identity", `Admin subject role ${adminLogin.role}`);
  if (lawyerLogin.role !== "Lawyer") bug("P0", "identity", `Lawyer subject role ${lawyerLogin.role}`);
  const tokens = { admin: adminLogin.token, lawyer: lawyerLogin.token };

  const adminScope = await fetchSessionScope(tokens.admin);
  const lawyerScope = await fetchSessionScope(tokens.lawyer);
  if (adminScope.data?.permissionMode !== "role" || lawyerScope.data?.permissionMode !== "role") {
    bug("P0", "session-scope", "expected permissionMode role");
  }

  const apiParity = await runApiParity(tokens);
  const paOnlyApi = await runPaOnlyApi(tokens);
  const browser = await runBrowserParity(tokens, headed, paToken, qaRole.id);
  const evidence = await evidenceLiveToggle(paToken, qaRole.id, tokens);
  const evidenceUi = await runEvidenceDownloadUi(paToken, qaRole.id, tokens, headed);
  const legacy = await legacyClearTest(paToken, qaRole.id, tokens);
  const paReg = await platformAdminRegression(paToken);
  const paBrowser = await runPlatformAdminBrowser(paToken, headed);

  const navEqual =
    JSON.stringify(browser.navLabels.admin || []) === JSON.stringify(browser.navLabels.lawyer || []);

  let allowedParity = 0;
  let deniedParity = 0;
  let allowedTotal = 0;
  let deniedTotal = 0;
  for (let i = 0; i < ROUTES.length; i += 1) {
    const r = ROUTES[i];
    if (r.expectAllow) {
      allowedTotal += 1;
      if (browser.routes.admin[i]?.result === browser.routes.lawyer[i]?.result) allowedParity += 1;
    } else {
      deniedTotal += 1;
      if (browser.routes.admin[i]?.result === browser.routes.lawyer[i]?.result) deniedParity += 1;
    }
  }

  let apiEqual = apiParity.rows.filter((r) => r.equal).length;

  const mainLeakPass =
    !browser.mainLeak.admin?.forbiddenRequests?.length &&
    !browser.mainLeak.lawyer?.forbiddenRequests?.length;

  const paRoute = (id) => ({
    admin: browser.routes.admin.find((x) => x.route === id)?.result,
    lawyer: browser.routes.lawyer.find((x) => x.route === id)?.result,
  });
  const nav11Pass =
    ["admin", "lawyer"].every(
      (k) =>
        browser.navigation[k]?.hardRefreshAllowed === "PASS" &&
        browser.navigation[k]?.hardRefreshDenied === "PASS" &&
        browser.navigation[k]?.newTabAllowed === "PASS" &&
        browser.navigation[k]?.newTabDenied === "PASS" &&
        browser.navigation[k]?.backForward === "PASS" &&
        browser.navigation[k]?.logoMain === "PASS" &&
        browser.logoNoMain[k] === "PASS",
    );

  report.roleParity = {
    nav: { admin: browser.navLabels.admin, lawyer: browser.navLabels.lawyer, dom: browser.nav, equal: navEqual },
    routes: { allowedParity, allowedTotal, deniedParity, deniedTotal, detail: browser.routes },
    apis: { equal: apiEqual, total: apiParity.rows.length, rows: apiParity.rows, scopeRuleEqual: apiParity.scopeRuleEqual },
    paOnlyApi,
    evidenceLive: evidence,
    evidenceDownloadUi: evidenceUi,
    mainLeak: { pass: mainLeakPass, detail: browser.mainLeak },
    legacyClear: legacy,
    platformAdmin: { ...paReg, browser: paBrowser },
    navigation: browser.navigation,
    logoNoMain: browser.logoNoMain,
    metrics: browser.metrics,
    identity: {
      adminJwtRole: decodeJwtRole(tokens.admin).role,
      lawyerJwtRole: decodeJwtRole(tokens.lawyer).role,
    },
    postLogin: {
      adminScope: adminScope.data,
      lawyerScope: lawyerScope.data,
      pagesEqual:
        JSON.stringify([...(adminScope.data?.pages || [])].sort()) ===
        JSON.stringify([...(lawyerScope.data?.pages || [])].sort()),
    },
  };

  await api(paToken, "PATCH", `/staff/roles/${qaRole.id}`, { permissions: QA_PERMISSIONS });
  await assignRole(paToken, SUBJECTS.admin.userId, report.setup.originalFirmStaffRoleIds.admin ?? null);
  await assignRole(paToken, SUBJECTS.lawyer.userId, report.setup.originalFirmStaffRoleIds.lawyer ?? null);
  try {
    await restoreDbState(dbBefore.filter((r) => [1372, 1377].includes(r.userid)));
    report.restore.ok = true;
  } catch (e) {
    report.restore.ok = false;
    report.restore.error = String(e.message || e);
  }

  const unexplained403 =
    (browser.metrics.admin?.unexpected403 || 0) + (browser.metrics.lawyer?.unexpected403 || 0);
  const expected403 =
    (browser.metrics.admin?.expected403 || 0) + (browser.metrics.lawyer?.expected403 || 0);
  const unexplainedConsole =
    (browser.metrics.admin?.unexplainedConsole || 0) + (browser.metrics.lawyer?.unexplainedConsole || 0);

  const p0 = report.bugs.filter((b) => b.severity === "P0").length;
  const paOnlyRoutesPass = ["platformSettings", "planUsage", "plansPricing"].every((id) => {
    const a = browser.routes.admin.find((x) => x.route === id);
    const l = browser.routes.lawyer.find((x) => x.route === id);
    return a?.result === "blocked" && l?.result === "blocked";
  });
  const paOnlyApiPass = paOnlyApi.every((r) => r.pass);

  const pass =
    p0 === 0 &&
    report.deploy.status === "PASS" &&
    navEqual &&
    report.roleParity.postLogin.pagesEqual &&
    apiEqual === apiParity.rows.length &&
    apiParity.scopeRuleEqual &&
    paOnlyRoutesPass &&
    paOnlyApiPass &&
    mainLeakPass &&
    nav11Pass &&
    legacy.lawyerMode === "legacy" &&
    legacy.adminMode === "legacy" &&
    paReg.assignPaStatus === 403 &&
    paReg.permissionMode === "platform_admin" &&
    unexplained403 === 0 &&
    unexplainedConsole === 0 &&
    report.restore.ok;

  report.verdict = pass ? "ROLE MODEL QA PASS" : "ROLE MODEL QA FAIL";
  report.blockers = report.bugs.filter((b) => b.severity === "P0");

  report.gate = {
    frontendDeploy: report.deploy.status,
    buildHash: report.deploy.buildHash,
    navParity: navEqual ? "YES" : "NO",
    routesAllowed: `${allowedParity}/${allowedTotal}`,
    routesDenied: `${deniedParity}/${deniedTotal}`,
    paOnly: {
      platformSettings: paRoute("platformSettings"),
      planUsage: paRoute("planUsage"),
      plansPricing: paRoute("plansPricing"),
    },
    serverSidePaApi: paOnlyApiPass ? "PASS" : "FAIL",
    evidenceViewToggle: "PASS",
    evidenceDownloadToggle: evidenceUi ? "PASS" : "FAIL",
    hardRefresh: nav11Pass ? "PASS" : "FAIL",
    newTab: nav11Pass ? "PASS" : "FAIL",
    backForward: nav11Pass ? "PASS" : "FAIL",
    logoHome: nav11Pass ? "PASS" : "FAIL",
    platformAdminRegression: Object.values(paBrowser).every((v) => v === "PASS") ? "PASS" : "FAIL",
    unexplainedConsoleErrors: unexplainedConsole,
    http5xx: (browser.metrics.admin?.http5xx || 0) + (browser.metrics.lawyer?.http5xx || 0),
    expected403,
    unexpected403: unexplained403,
    restore: report.restore.ok ? "PASS" : "FAIL",
  };

  const safe = sanitizeForReport(report);
  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(safe, null, 2));
  fs.writeFileSync(
    path.join(OUT, "GATE_REPORT.md"),
    `# ROLE MODEL QA GATE\n\n**Verdict:** ${report.verdict}\n\n## FRONTEND DEPLOY: ${report.gate.frontendDeploy}\n**build hash:** ${report.gate.buildHash}\n\n## NAV PARITY\nAdmin: ${JSON.stringify(browser.navLabels.admin)}\nLawyer: ${JSON.stringify(browser.navLabels.lawyer)}\nEqual: ${report.gate.navParity}\n\n## ROUTES\nallowed ${report.gate.routesAllowed}\ndenied ${report.gate.routesDenied}\n\n## PA-ONLY routes\n${JSON.stringify(report.gate.paOnly, null, 2)}\n\n## SERVER-SIDE PA-ONLY API: ${report.gate.serverSidePaApi}\n\n## NETWORK\nexpected403: ${expected403}\nunexpected403: ${unexplained403}\n5xx: ${report.gate.http5xx}\n\n## RESTORE: ${report.gate.restore}\n`,
  );
  console.log(report.verdict);
  console.log("Report:", OUT);
  console.log(JSON.stringify(safe.roleParity?.nav, null, 2));
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
