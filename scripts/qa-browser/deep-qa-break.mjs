/**
 * Deep QA — break-the-product suite (QA mutations OK, prod read-only).
 */
import { chromium, devices } from "playwright";
import fs from "fs";
import path from "path";

const QA = {
  base: "https://melamedia.mela-media.co.il",
  api: "https://api-melamedia.mela-media.co.il/api",
};
const PROD = {
  base: "https://client.melamedlaw.co.il",
  api: "https://api.calls.melamedlaw.co.il/api",
};
const OTP = "123456";
const PHONES = {
  admin: "0507299064",
  roleA: "0509999101",
  roleB: "0509999102",
  roleC: "0509999103",
  roleD: "0509999104",
};
const ROLE_C_ID = "330ba557-4866-43ff-a057-cc584638108b";
const PREFIX = "QA TEST - DELETE ME";

const OUT = path.join(
  process.cwd(),
  "results-deep",
  new Date().toISOString().slice(0, 19).replace(/:/g, "-"),
);
fs.mkdirSync(OUT, { recursive: true });

const bugs = [];
const passes = [];
const skips = [];
const coverage = {
  screensDiscovered: new Set(),
  screensTested: new Set(),
  controlsDiscovered: 0,
  controlsExercised: 0,
  controlsSkipped: [],
  routesTested: new Set(),
  apiEndpoints: new Set(),
  viewports: [],
};

function bug(severity, title, detail) {
  bugs.push({ severity, title, ...detail });
  console.log(`BUG ${severity}: ${title}`);
}

function pass(msg) {
  passes.push(msg);
}

function skip(msg, reason) {
  skips.push({ msg, reason });
}

async function apiLogin(apiBase, phone, tries = 5) {
  let last = "";
  for (let i = 0; i < tries; i++) {
    await fetch(`${apiBase}/auth/RequestOtp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: phone }),
    });
    await new Promise((r) => setTimeout(r, 900 + i * 400));
    const res = await fetch(`${apiBase}/auth/VerifyOtp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: phone, otp: OTP }),
    });
    const data = await res.json();
    if (data.token) return data;
    last = `${res.status} ${JSON.stringify(data)}`;
    await new Promise((r) => setTimeout(r, 12000));
  }
  throw new Error(`login ${phone}: ${last}`);
}

async function apiJson(token, apiBase, method, path, body) {
  const url = `${apiBase}${path}`;
  coverage.apiEndpoints.add(`${method} ${path}`);
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function injectAuth(page, base, auth) {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate((a) => {
    localStorage.clear();
    localStorage.setItem("token", a.token);
    localStorage.setItem("role", a.role);
    localStorage.setItem("isPlatformAdmin", a.isPlatformAdmin ? "true" : "false");
    if (a.refreshToken) localStorage.setItem("refreshToken", a.refreshToken);
  }, auth);
}

async function newAuthedPage(browser, base, apiBase, phone) {
  const auth = await apiLogin(apiBase, phone);
  const ctx = await browser.newContext({ locale: "he-IL" });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const network = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("response", (r) => {
    const u = r.url();
    if (u.includes("/api/")) {
      network.push({ status: r.status(), url: u });
      if (r.status() >= 500) network.last().fail500 = true;
    }
  });
  await injectAuth(page, base, auth);
  return { ctx, page, auth, consoleErrors, pageErrors, network };
}

async function discoverControls(page) {
  const sel =
    "button:visible, a[href]:visible, [role='button']:visible, input[type=checkbox]:visible, input[type=radio]:visible, select:visible, [class*='PrimaryButton']:visible, [class*='SecondaryButton']:visible";
  const els = await page.locator(sel).all();
  return els.length;
}

async function clickAllSafe(page, max = 40) {
  const sel =
    "button:visible:not([disabled]), [role='button']:visible:not([disabled]), a[href]:visible";
  const loc = page.locator(sel);
  const n = Math.min(await loc.count(), max);
  let clicked = 0;
  for (let i = 0; i < n; i++) {
    const el = loc.nth(i);
    const txt = ((await el.innerText().catch(() => "")) || "").slice(0, 40);
    if (/logout|התנתק|יציאה/i.test(txt)) continue;
    try {
      await el.click({ timeout: 3000 });
      clicked++;
      await page.waitForTimeout(400);
      if (await page.locator('[class*="PopUp"], [role="dialog"]').isVisible().catch(() => false)) {
        await page.keyboard.press("Escape").catch(() => {});
        await page.getByRole("button", { name: /ביטול|סגור|cancel/i }).first().click({ timeout: 1500 }).catch(() => {});
      }
    } catch {
      coverage.controlsSkipped.push({ i, txt, reason: "click failed" });
    }
  }
  return clicked;
}

const ADMIN_ROUTES = [
  "/AdminStack/MainScreen",
  "/AdminStack/AllCasesScreen",
  "/AdminStack/AllClientsScreen",
  "/AdminStack/AllCasesType",
  "/AdminStack/SigningManagerScreen",
  "/AdminStack/RemindersScreen",
  "/AdminStack/CalendarScreen",
  "/AdminStack/support",
  "/AdminStack/FirmStaffRoles",
];

const ROLE_A_DENIED = [
  "/AdminStack/AllClientsScreen",
  "/AdminStack/AllCasesType",
  "/AdminStack/SigningManagerScreen",
  "/AdminStack/CalendarScreen",
  "/AdminStack/RemindersScreen",
  "/AdminStack/FirmStaffRoles",
];

async function run() {
  const headed = process.argv.includes("--headed");
  const browser = await chromium.launch({ headless: !headed, slowMo: headed ? 40 : 0 });

  // --- API: Role A case filters ---
  const authA = await apiLogin(QA.api, PHONES.roleA);
  const casesA = (await apiJson(authA.token, QA.api, "GET", "/cases/GetCases")).json || [];
  const openIds = casesA.filter((c) => !c.IsClosed).map((c) => c.CaseId || c.caseid);
  const closedIds = casesA.filter((c) => c.IsClosed).map((c) => c.CaseId || c.caseid);
  if (!openIds.includes(275) || !closedIds.includes(286)) {
    bug("P1", "Role A API case fixtures missing 275/286", {
      steps: "GET /cases/GetCases as Role A",
      expected: "275 open, 286 closed",
      actual: { openIds, closedIds },
    });
  } else pass("Role A API: 275 open + 286 closed present");

  // --- Admin API: role validation torture ---
  const authAdmin = await apiLogin(QA.api, PHONES.admin);
  const emptyName = await apiJson(authAdmin.token, QA.api, "POST", "/staff/roles", {
    name: "   ",
    permissions: { areas: {} },
  });
  if (emptyName.status !== 400) {
    bug("P2", "Create role whitespace-only name not rejected", {
      expected: "400",
      actual: emptyName.status,
    });
  } else pass("Backend rejects whitespace role name");

  const dupProbe = `${PREFIX} DUP ${Date.now()}`;
  const dup1 = await apiJson(authAdmin.token, QA.api, "POST", "/staff/roles", {
    name: dupProbe,
    permissions: { areas: { main: { visible: true, actions: [] } } },
  });
  const dup2 = await apiJson(authAdmin.token, QA.api, "POST", "/staff/roles", {
    name: dupProbe,
    permissions: { areas: { main: { visible: true, actions: [] } } },
  });
  if (dup2.status !== 409) {
    bug("P1", "Duplicate active role name allowed", {
      expected: "409 CONFLICT",
      actual: dup2.status,
      rootCause: "PostgreSQL UNIQUE (tenant_id, name) treats NULL tenant as distinct; needs app-level check",
      files: ["backend/controllers/staffRolesController.js"],
    });
  } else pass("Backend duplicate role name 409");
  if (dup1.json?.id) await apiJson(authAdmin.token, QA.api, "DELETE", `/staff/roles/${dup1.json.id}`);

  const testRoleName = `${PREFIX} ROLE ${Date.now()}`;
  const created = await apiJson(authAdmin.token, QA.api, "POST", "/staff/roles", {
    name: testRoleName,
    permissions: {
      areas: {
        main: { visible: true, actions: [] },
        cases: { visible: true, actions: ["view"], dataScope: "all_firm" },
      },
    },
  });
  let testRoleId = created.json?.id;
  if (created.status !== 201 || !testRoleId) {
    bug("P1", "Could not create QA test role", { actual: created });
  } else {
    pass("Created QA test role via API");
    const scopeSwitch = await apiJson(authAdmin.token, QA.api, "PATCH", `/staff/roles/${testRoleId}`, {
      permissions: {
        areas: {
          main: { visible: true, actions: [] },
          cases: { visible: true, actions: ["view"], dataScope: "assigned_only" },
        },
      },
    });
    const reread = await apiJson(authAdmin.token, QA.api, "GET", "/staff/roles");
    const found = (reread.json || []).find((r) => r.id === testRoleId);
    const ds = found?.permissions?.areas?.cases?.dataScope;
    if (ds !== "assigned_only") {
      bug("P2", "dataScope assigned_only not persisted", { actual: ds });
    } else pass("dataScope persistence assigned_only");

    const deactBlocked = await apiJson(authAdmin.token, QA.api, "DELETE", `/staff/roles/5775ece0-8e6c-48fc-9f19-8ea5c1d5ade2`);
    if (deactBlocked.status !== 409) {
      bug("P1", "Deactivate role with employees must 409", { actual: deactBlocked.status });
    } else pass("Deactivate blocked when employees assigned");

    await apiJson(authAdmin.token, QA.api, "DELETE", `/staff/roles/${testRoleId}`);
  }

  // --- UI Admin FirmStaffRoles ---
  ADMIN_ROUTES.forEach((r) => coverage.screensDiscovered.add(r));
  const admin = await newAuthedPage(browser, QA.base, QA.api, PHONES.admin);
  await admin.page.goto(`${QA.base}/AdminStack/FirmStaffRoles`, { waitUntil: "domcontentloaded" });
  coverage.screensTested.add("FirmStaffRoles");
  coverage.routesTested.add("/AdminStack/FirmStaffRoles");
  await admin.page.waitForTimeout(2000);

  const deactivateBtn = admin.page.getByRole("button", { name: /השב|deactivate|מחק תפקיד/i });
  if ((await deactivateBtn.count()) === 0) {
    bug("P2", "FirmStaffRoles: no deactivate control in UI", {
      steps: "Open FirmStaffRoles as platform admin",
      expected: "Deactivate for roles without employees",
      actual: "API DELETE exists; UI missing",
      files: ["frontend/src/screens/firmStaffRoles/FirmStaffRolesScreen.js"],
    });
  }

  const createBtn = admin.page.getByRole("button", { name: /תפקיד חדש/i });
  await createBtn.click();
  await admin.page.waitForTimeout(500);
  const saveBtn = admin.page.locator(".lw-firmStaffRoles__editorActions button").first();
  const saveDisabled = await saveBtn.isDisabled().catch(() => false);
  if (!saveDisabled) {
    bug("P3", "Create role Save enabled with empty name", {});
  } else pass("Create role: Save disabled when name empty");

  await admin.page.locator(".lw-firmStaffRoles__editor input").first().fill(`${PREFIX} UI`);
  const checkboxes = admin.page.locator(".lw-firmStaffRoles__areaBlock input[type=checkbox]");
  const cbCount = await checkboxes.count();
  coverage.controlsDiscovered += cbCount + 5;
  for (let i = 0; i < cbCount; i++) {
    await checkboxes.nth(i).click({ force: true }).catch(() => {});
    coverage.controlsExercised++;
  }
  const radios = admin.page.locator(".lw-firmStaffRoles__scopeRow input[type=radio]");
  for (let i = 0; i < (await radios.count()); i++) {
    await radios.nth(i).click({ force: true });
    coverage.controlsExercised++;
  }
  await admin.page.getByRole("button", { name: /^ביטול$/ }).click();
  pass("Admin: exercised permission matrix checkboxes/radios");

  const rolesApi = await apiJson(authAdmin.token, QA.api, "GET", "/staff/roles");
  const roleRows = rolesApi.json || [];
  const extras = roleRows.filter((r) => String(r.name).includes("QA TEST"));
  if (extras.length) {
    for (const r of extras) {
      if ((r.assignedUserCount ?? 0) === 0) {
        await apiJson(authAdmin.token, QA.api, "DELETE", `/staff/roles/${r.id}`);
      }
    }
  }
  if (roleRows.length !== 4) {
    bug("P2", "Role list count not 4 after QA cleanup", {
      actual: roleRows.length,
      names: roleRows.map((r) => r.name),
    });
  } else pass("Admin role list count = 4");

  await admin.page.screenshot({ path: path.join(OUT, "qa-admin-firm-staff.png"), timeout: 8000 }).catch(() => {});
  await admin.ctx.close();

  // --- Role A UI: filters + unauthorized ---
  const ra = await newAuthedPage(browser, QA.base, QA.api, PHONES.roleA);
  await ra.page.goto(`${QA.base}/AdminStack/AllCasesScreen`, { waitUntil: "networkidle" });
  coverage.screensTested.add("AllCasesScreen");
  coverage.routesTested.add("/AdminStack/AllCasesScreen");

  const newCaseNav = ra.page.getByText(/תיק חדש|newOrUpdateCase|עדכון תיק/i);
  if (await newCaseNav.first().isVisible().catch(() => false)) {
    bug("P1", "Role A sees new/update case nav without create/edit", {});
  } else pass("Role A: no new case nav");

  async function countCasesInDom() {
    const body = await ra.page.locator("body").innerText();
    let n = 0;
    for (const id of [...openIds, ...closedIds]) {
      if (body.includes(String(id))) n++;
    }
    return { bodyHasIds: n, bodySample: body.slice(0, 500) };
  }
  try {
    await ra.page.waitForTimeout(3000);
    const openDom = await countCasesInDom();
    await ra.page.getByText(/סינון סטטוס|statusFilter|סטטוס/i).first().click({ timeout: 8000 }).catch(() => {});
    await ra.page.getByText(/תיקים סגורים|closedCases|סגורים/i).first().click({ timeout: 8000 }).catch(() => {});
    await ra.page.waitForTimeout(2500);
    const closedDom = await countCasesInDom();
    if (openDom.bodyHasIds < 1 && openIds.includes(275)) {
      bug("P2", "Role A open filter: case 275 not visible in UI", { openDom, openIds });
    } else pass("Role A open filter shows assigned open case");
    if (closedDom.bodyHasIds < 1 && closedIds.includes(286)) {
      bug("P2", "Role A closed filter: case 286 not visible", { closedDom, closedIds });
    } else pass("Role A closed filter shows assigned closed case");
  } catch (e) {
    skip("Role A status filter UI", String(e.message));
  }

  for (const route of ROLE_A_DENIED) {
    await ra.page.goto(`${QA.base}${route}`, { waitUntil: "domcontentloaded" });
    await ra.page.waitForTimeout(1200);
    coverage.routesTested.add(route);
    const url = ra.page.url();
    if (url.includes(route.split("/").pop()) && !url.includes("MainScreen") && !url.includes("NoPermissions")) {
      const leaked = await ra.page.locator("table, .lw-allClientsScreen, .lw-signing").first().isVisible().catch(() => false);
      if (leaked) {
        bug("P0", `Role A direct URL leaked content: ${route}`, { url });
      }
    }
    const staffApi = await ra.page.evaluate(
      async ({ api, route }) => {
        const t = localStorage.getItem("token");
        const map = {
          AllClientsScreen: "/Customers/GetCustomers",
          SigningManagerScreen: "/SigningFiles/lawyer-files",
          AllCasesType: "/CaseTypes/GetCaseTypes",
        };
        const seg = route.split("/").pop();
        const p = map[seg];
        if (!p) return null;
        const r = await fetch(`${api}${p}`, { headers: { Authorization: `Bearer ${t}` } });
        return r.status;
      },
      { api: QA.api, route },
    );
    if (staffApi === 200) {
      bug("P0", `Role A API allowed forbidden route ${route}`, { status: staffApi });
    }
  }
  pass("Role A unauthorized routes checked");

  const tamper = await ra.page.evaluate(async (api) => {
    localStorage.setItem("isPlatformAdmin", "true");
    const t = localStorage.getItem("token");
    const r = await fetch(`${api}/staff/roles`, { headers: { Authorization: `Bearer ${t}` } });
    return r.status;
  }, QA.api);
  if (tamper === 200) {
    bug("P0", "localStorage isPlatformAdmin tampering grants staff/roles API", { status: tamper });
  } else pass("Escalation: tampered isPlatformAdmin still denied staff/roles");

  await ra.ctx.close();

  // --- Role B: clients + case create flow (partial UI) ---
  let rb;
  try {
    rb = await newAuthedPage(browser, QA.base, QA.api, PHONES.roleB);
  } catch (e) {
    skip("Role B browser session", String(e.message));
    rb = null;
  }
  if (rb) {
    await rb.page.goto(`${QA.base}/AdminStack/AllClientsScreen`, { waitUntil: "domcontentloaded" });
    coverage.screensTested.add("AllClientsScreen");
    const dc = await discoverControls(rb.page);
    coverage.controlsDiscovered += dc;
    const clickedB = await clickAllSafe(rb.page, 25);
    coverage.controlsExercised += clickedB;

    await rb.page.goto(`${QA.base}/AdminStack/SigningManagerScreen`, { waitUntil: "domcontentloaded" });
    await rb.page.waitForTimeout(1500);
    if (rb.page.url().includes("SigningManager") && !rb.page.url().includes("MainScreen")) {
      bug("P1", "Role B reached Signing without signing.view", { url: rb.page.url() });
    } else pass("Role B signing URL blocked");
    await rb.ctx.close();
  }
  try {
    const signB = await apiJson((await apiLogin(QA.api, PHONES.roleB)).token, QA.api, "GET", "/SigningFiles/lawyer-files");
    if (signB.status === 200) {
      bug("P0", "Role B signing API should deny", { status: signB.status });
    } else pass(`Role B signing API denied (${signB.status})`);
  } catch (e) {
    skip("Role B signing API", String(e.message));
  }

  // --- Role C dynamic permissions (API admin + UI user) ---
  const rc = await newAuthedPage(browser, QA.base, QA.api, PHONES.roleC);
  await rc.page.goto(`${QA.base}/AdminStack/AllCasesScreen`, { waitUntil: "domcontentloaded" });
  await rc.page.waitForTimeout(1500);
  if (rc.page.url().includes("AllCasesScreen")) {
    bug("P1", "Role C without cases.view reached AllCases", { url: rc.page.url() });
  } else pass("Role C blocked from AllCases initially");

  const roleCGet = await apiJson(authAdmin.token, QA.api, "GET", "/staff/roles");
  const roleC = (roleCGet.json || []).find((r) => r.id === ROLE_C_ID);
  const origPerms = JSON.parse(JSON.stringify(roleC.permissions));

  const addCases = JSON.parse(JSON.stringify(origPerms));
  addCases.areas.cases = { visible: true, actions: ["view"], dataScope: "all_firm" };
  await apiJson(authAdmin.token, QA.api, "PATCH", `/staff/roles/${ROLE_C_ID}`, { permissions: addCases });

  await rc.page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  await rc.page.reload({ waitUntil: "domcontentloaded" });
  await rc.page.goto(`${QA.base}/AdminStack/AllCasesScreen`, { waitUntil: "domcontentloaded" });
  await rc.page.waitForTimeout(2500);
  if (!rc.page.url().includes("AllCasesScreen")) {
    bug("P1", "Role C after cases.view grant cannot reach AllCases without re-login", { url: rc.page.url() });
  } else pass("Role C live permission add: AllCases after refresh");

  await apiJson(authAdmin.token, QA.api, "PATCH", `/staff/roles/${ROLE_C_ID}`, { permissions: origPerms });
  await rc.page.reload();
  await rc.page.waitForTimeout(2000);
  await rc.page.goto(`${QA.base}/AdminStack/AllCasesScreen`, { waitUntil: "domcontentloaded" });
  await rc.page.waitForTimeout(1500);
  if (rc.page.url().includes("AllCasesScreen")) {
    bug("P1", "Role C still on AllCases after permission removed", { url: rc.page.url() });
  } else pass("Role C permission revoke redirects away from AllCases");

  await rc.ctx.close();

  // --- Role D torture ---
  const rd = await newAuthedPage(browser, QA.base, QA.api, PHONES.roleD);
  const urls = [
    `${QA.base}/AdminStack/MainScreen`,
    `${QA.base}/AdminStack/AllCasesScreen`,
    `${QA.base}/AdminStack/NoPermissions`,
  ];
  for (const u of urls) {
    await rd.page.goto(u, { waitUntil: "domcontentloaded" });
    await rd.page.waitForTimeout(800);
  }
  await rd.page.reload();
  await rd.page.waitForTimeout(2000);
  const stable = rd.page.url();
  await rd.page.waitForTimeout(3000);
  if (rd.page.url() !== stable) {
    bug("P1", "Role D redirect loop", { from: stable, to: rd.page.url() });
  } else pass("Role D URL stable");
  const reqs = rd.network.filter((n) => n.fail500);
  if (reqs.length) bug("P1", "Role D caused 500s", { reqs });

  await rd.ctx.close();

  // --- Visual viewports FirmStaffRoles + NoPermissions ---
  const viewports = [
    { name: "1440", width: 1440, height: 900 },
    { name: "1024", width: 1024, height: 768 },
    { name: "768", width: 768, height: 1024 },
    { name: "390", width: 390, height: 844 },
  ];
  for (const vp of viewports) {
    coverage.viewports.push(vp.name);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: "he-IL" });
    const page = await ctx.newPage();
    await injectAuth(page, QA.base, authAdmin);
    await page.goto(`${QA.base}/AdminStack/FirmStaffRoles`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    if (overflow && vp.name === "390") {
      bug("P3", "FirmStaffRoles horizontal overflow on mobile", { viewport: vp.name });
    }
    await page.screenshot({ path: path.join(OUT, `qa-firm-staff-${vp.name}.png`), timeout: 8000 }).catch(() => {});
    await ctx.close();
  }

  // --- Prod read-only baseline screenshots ---
  try {
    const prodAuth = await apiLogin(PROD.api, PHONES.admin);
    const pctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const ppage = await pctx.newPage();
    await injectAuth(ppage, PROD.base, prodAuth);
    for (const route of ["/AdminStack/MainScreen", "/AdminStack/AllCasesScreen"]) {
      await ppage.goto(`${PROD.base}${route}`, { waitUntil: "domcontentloaded" });
      await ppage.waitForTimeout(1500);
      await ppage.screenshot({ path: path.join(OUT, `prod-${route.replace(/\//g, "_")}.png`), timeout: 8000 }).catch(() => {});
    }
    const prodStaff = await apiJson(prodAuth.token, PROD.api, "GET", "/staff/roles");
    if (prodStaff.status !== 404 && prodStaff.status !== 403) {
      bug("P2", "Unexpected prod staff API availability", { status: prodStaff.status });
    }
    await pctx.close();
  } catch (e) {
    skip("Prod visual baseline", String(e.message));
  }

  // --- session-scope inconsistency Role A ---
  const scopeA = await apiJson(authA.token, QA.api, "GET", "/staff/session-scope");
  const pages = scopeA.json?.pages || [];
  if (pages.includes("newOrUpdateCase") && !(scopeA.json?.areas?.cases?.actions || []).some((a) => a !== "view")) {
    bug("P2", "session-scope pages includes newOrUpdateCase but Role A lacks create/edit", {
      pages,
      actions: scopeA.json?.areas?.cases?.actions,
      rootCause: "listVisiblePageKeys adds navKeys when area visible",
      files: ["backend/lib/firmRolePermissions.js"],
    });
  }

  await browser.close();

  const report = {
    coverage: {
      screensDiscovered: [...coverage.screensDiscovered],
      screensTested: [...coverage.screensTested],
      controlsDiscovered: coverage.controlsDiscovered,
      controlsExercised: coverage.controlsExercised,
      controlsSkipped: coverage.controlsSkipped,
      routesTested: [...coverage.routesTested],
      apiEndpoints: [...coverage.apiEndpoints],
      viewports: coverage.viewports,
    },
    passCount: passes.length,
    failCount: bugs.length,
    skipCount: skips.length,
    passes,
    skips,
    bugs,
  };
  fs.writeFileSync(path.join(OUT, "DEEP_QA_REPORT.json"), JSON.stringify(report, null, 2));

  console.log("\n=== DEEP QA SUMMARY ===");
  console.log("Screens tested:", coverage.screensTested.size, "/", coverage.screensDiscovered.size);
  console.log("Controls exercised:", coverage.controlsExercised, "(discovered partial:", coverage.controlsDiscovered, ")");
  console.log("PASS assertions:", passes.length);
  console.log("BUGS:", bugs.length);
  console.log("Report:", path.join(OUT, "DEEP_QA_REPORT.json"));

  const p0p1 = bugs.filter((b) => b.severity === "P0" || b.severity === "P1");
  if (p0p1.length) {
    console.log("\nDEEP QA NOT READY");
    process.exit(2);
  }
  if (bugs.length) {
    console.log("\nDEEP QA NOT READY (P2/P3 open)");
    process.exit(1);
  }
  console.log("\nDEEP QA READY");
}

run().catch((e) => {
  bug("P1", "Deep QA runner crashed", { actual: String(e.message || e), stack: e.stack });
  console.error(e);
  const crashReport = path.join(OUT, "DEEP_QA_CRASH.json");
  fs.writeFileSync(crashReport, JSON.stringify({ bugs, passes, skips }, null, 2));
  process.exit(99);
});
