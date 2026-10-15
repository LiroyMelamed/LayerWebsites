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
};

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
    await dbExec("UPDATE users SET role = $2, firm_staff_role_id = $3 WHERE userid = $1", [
      row.userid,
      row.role,
      row.firm_staff_role_id,
    ]);
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

async function extractNavLabels(page) {
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    const links = [...document.querySelectorAll(".lw-topNavBar__link, .lw-rightNavBar__link, nav a, [class*='NavBar'] a")];
    const texts = links.map((a) => (a.textContent || "").trim()).filter(Boolean);
    return [...new Set(texts)];
  });
}

async function routeProbe(page, base, auth, route) {
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

async function runBrowserParity(tokens, headed) {
  const browser = await chromium.launch({ headless: !headed });
  const viewports = [
    { name: "1440", width: 1440, height: 900 },
    { name: "1024", width: 1024, height: 900 },
    { name: "768", width: 768, height: 900 },
    { name: "390", width: 390, height: 844 },
  ];

  const nav = {};
  const routes = { admin: [], lawyer: [] };
  const metrics = { admin: {}, lawyer: {} };
  const mainLeak = {};

  for (const [key, auth] of [
    ["admin", { token: tokens.admin, role: "Admin", isPlatformAdmin: false }],
    ["lawyer", { token: tokens.lawyer, role: "Lawyer", isPlatformAdmin: false }],
  ]) {
    const ctx = await browser.newContext({ locale: "he-IL", viewport: viewports[0] });
    const page = await ctx.newPage();
    const collector = { consoleError: 0, pageerror: 0, http5xx: 0, unexpected403: 0 };
    page.on("console", (m) => {
      if (m.type() === "error") collector.consoleError += 1;
    });
    page.on("pageerror", () => {
      collector.pageerror += 1;
    });
    page.on("response", (res) => {
      if (res.status() >= 500) collector.http5xx += 1;
      if (res.status() === 403 && !res.url().includes("GetManagerHomeData")) collector.unexpected403 += 1;
    });

    await injectSession(page, QA, auth);
    await page.goto(QA, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const landing = page.url();
    if (key === "lawyer" && landing.includes("ClientStack") && !landing.includes("AdminStack")) {
      bug("P0", "routing", "Lawyer with custom role stuck on ClientStack after login inject");
    }
    if (landing.includes("ClientStack") && landing.includes("ClientMain")) {
      await page.waitForTimeout(500);
      const after = page.url();
      if (after.includes("ClientStack") && !after.includes("AdminStack")) {
        bug("P1", "routing flash", "Possible ClientStack before redirect");
      }
    }

    nav[key] = await extractNavLabels(page);
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

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${QA}/AdminStack/AllCasesScreen`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${key}-nav-${vp.name}.png`), fullPage: false }).catch(() => {});
    }

    metrics[key] = collector;
    await ctx.close();
  }

  await browser.close();
  return { nav, routes, metrics, mainLeak };
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

async function main() {
  const headed = process.argv.includes("--headed");
  const skipDb = process.argv.includes("--skip-db-setup");
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
  const browser = await runBrowserParity(tokens, headed);
  const evidence = await evidenceLiveToggle(paToken, qaRole.id, tokens);
  const legacy = await legacyClearTest(paToken, qaRole.id, tokens);
  const paReg = await platformAdminRegression(paToken);

  const navEqual =
    JSON.stringify([...(browser.nav.admin || [])].sort()) ===
    JSON.stringify([...(browser.nav.lawyer || [])].sort());

  let routeEqual = 0;
  let routeTotal = 0;
  for (let i = 0; i < ROUTES.length; i += 1) {
    routeTotal += 1;
    if (browser.routes.admin[i]?.result === browser.routes.lawyer[i]?.result) routeEqual += 1;
  }

  let apiEqual = apiParity.rows.filter((r) => r.equal).length;

  const mainLeakPass =
    !browser.mainLeak.admin?.forbiddenRequests?.length &&
    !browser.mainLeak.lawyer?.forbiddenRequests?.length;

  report.roleParity = {
    nav: { admin: browser.nav.admin, lawyer: browser.nav.lawyer, equal: navEqual },
    routes: { equal: routeEqual, total: routeTotal, detail: browser.routes },
    apis: { equal: apiEqual, total: apiParity.rows.length, rows: apiParity.rows, casesScopeEqual: apiParity.scopeEqual },
    evidenceLive: evidence,
    mainLeak: { pass: mainLeakPass, detail: browser.mainLeak },
    legacyClear: legacy,
    platformAdmin: paReg,
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

  await assignRole(paToken, SUBJECTS.admin.userId, report.setup.originalFirmStaffRoleIds.admin);
  await assignRole(paToken, SUBJECTS.lawyer.userId, report.setup.originalFirmStaffRoleIds.lawyer);
  if (dbBefore && !skipDb) {
    await restoreDbState(dbBefore);
    report.restore.ok = true;
  } else {
    report.restore.ok = false;
    report.restore.note = skipDb ? "Manual restore required (see db-before.json)" : "no snapshot";
  }

  const p0 = report.bugs.filter((b) => b.severity === "P0").length;
  const pass =
    p0 === 0 &&
    navEqual &&
    report.roleParity.postLogin.pagesEqual &&
    apiEqual === apiParity.rows.length &&
    apiParity.scopeRuleEqual &&
    mainLeakPass &&
    legacy.lawyerMode === "legacy" &&
    legacy.adminMode === "legacy" &&
    paReg.assignPaStatus === 403 &&
    paReg.permissionMode === "platform_admin";

  report.verdict = pass ? "ROLE MODEL QA PASS" : "ROLE MODEL QA FAIL";
  report.blockers = report.bugs.filter((b) => b.severity === "P0");

  const safe = sanitizeForReport(report);
  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(safe, null, 2));
  fs.writeFileSync(
    path.join(OUT, "REPORT.md"),
    `# Role Parity QA\n\n**Verdict:** ${report.verdict}\n\n## Nav equal: ${navEqual}\n## API equal: ${apiEqual}/${apiParity.rows.length}\n## Routes equal: ${routeEqual}/${routeTotal}\n## P0 bugs: ${p0}\n`,
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
