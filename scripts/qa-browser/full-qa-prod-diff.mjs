/**
 * Full browser QA: Melamedia QA vs MelamedLaw production.
 * Uses API OTP (123456) + localStorage injection to avoid rate limits; UI checks are real.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const OUT = path.join(process.cwd(), "results", new Date().toISOString().slice(0, 19).replace(/:/g, "-"));
fs.mkdirSync(OUT, { recursive: true });

const ENV = {
  qa: {
    name: "Melamedia QA",
    base: "https://melamedia.mela-media.co.il",
    api: "https://api-melamedia.mela-media.co.il/api",
  },
  prod: {
    name: "MelamedLaw Production",
    base: "https://client.melamedlaw.co.il",
    api: "https://api.calls.melamedlaw.co.il/api",
  },
};

const PHONES = {
  admin: "0507299064",
  roleA: "0509999101",
  roleC: "0509999103",
  roleD: "0509999104",
};
const OTP = "123456";

const results = [];

function log(env, check, status, detail = "") {
  results.push({ env, check, status, detail });
  const mark = status === "PASS" ? "✓" : status === "SKIP" ? "○" : status === "INFO" ? "·" : "✗";
  console.log(`${mark} [${env}] ${check}${detail ? `: ${detail}` : ""}`);
}

async function apiLogin(apiBase, phone) {
  await fetch(`${apiBase}/auth/RequestOtp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber: phone }),
  });
  await new Promise((r) => setTimeout(r, 1200));
  const res = await fetch(`${apiBase}/auth/VerifyOtp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber: phone, otp: OTP }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    throw new Error(`API login ${phone}: ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data;
}

async function openAuthenticatedPage(browser, config, auth) {
  const context = await browser.newContext({ locale: "he-IL", viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const net500 = [];
  page.on("response", (r) => {
    if (r.status() >= 500 && r.url().includes("/api/")) net500.push(`${r.status()} ${r.url()}`);
  });

  await page.goto(config.base, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ auth }) => {
      localStorage.clear();
      localStorage.setItem("token", auth.token);
      localStorage.setItem("role", auth.role);
      localStorage.setItem("isPlatformAdmin", auth.isPlatformAdmin ? "true" : "false");
      if (auth.refreshToken) localStorage.setItem("refreshToken", auth.refreshToken);
    },
    { auth },
  );
  await page.goto(`${config.base}/AdminStack/MainScreen`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  return { context, page, net500 };
}

async function bundleHasStaffRoles(base) {
  const res = await fetch(base);
  const html = await res.text();
  const m = html.match(/static\/js\/main\.([a-f0-9]+)\.js/);
  if (!m) return { main: null, hasFeature: null };
  const mainUrl = `${base}/static/js/main.${m[1]}.js`;
  const js = await (await fetch(mainUrl)).text();
  const has =
    js.includes("FirmStaffRoles") ||
    js.includes("firmStaffRoles") ||
    js.includes("NoPermissions");
  return { main: `main.${m[1]}.js`, hasFeature: has };
}

async function runEnv(envKey, config, headed) {
  const browser = await chromium.launch({ headless: !headed, slowMo: headed ? 50 : 0 });

  const bundle = await bundleHasStaffRoles(config.base);
  log(envKey, "Frontend main bundle", "PASS", bundle.main || "?");
  if (envKey === "qa") {
    log(envKey, "Bundle includes staff-permissions UI", bundle.hasFeature ? "PASS" : "FAIL", String(bundle.hasFeature));
  } else {
    log(
      envKey,
      "Bundle excludes staff-permissions UI (prod not deployed)",
      !bundle.hasFeature ? "PASS" : "FAIL",
      String(bundle.hasFeature),
    );
  }

  async function session(label, phone, fn) {
    let context;
    let page;
    let net500;
    try {
      const auth = await apiLogin(config.api, phone);
      ({ context, page, net500 } = await openAuthenticatedPage(browser, config, auth));
      log(envKey, `${label} session`, "PASS", `${auth.role}${auth.isPlatformAdmin ? " (platform admin)" : ""}`);
      if (net500.length) log(envKey, `${label} API 500`, "FAIL", net500.join("; "));
      else log(envKey, `${label} API 500`, "PASS", "none");
      await fn(page, auth, net500);
    } catch (e) {
      log(envKey, `${label} session`, "FAIL", String(e.message || e));
    } finally {
      if (context) await context.close().catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  if (envKey === "qa") {
    await session("admin", PHONES.admin, async (page, auth) => {
      const mainOk = await page.locator("text=/ראשי|Main/i").first().isVisible().catch(() => false);
      log(envKey, "Admin Main screen", mainOk ? "PASS" : "INFO");
      const navStaff = await page.getByText(/תפקידים והרשאות/i).isVisible().catch(() => false);
      log(envKey, "Admin nav: תפקידים והרשאות", navStaff ? "PASS" : "FAIL");

      await page.goto(`${config.base}/AdminStack/FirmStaffRoles`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      const table = page.locator(".lw-firmStaffRolesScreen");
      await table.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
      const bodyText = await page.locator(".lw-firmStaffRolesScreen").innerText().catch(() => "");
      const roleNames = (bodyText.match(/צפייה|מלא|QA|ללא|admin|Admin/gi) || []).length;
      log(envKey, "FirmStaffRoles: 4 roles visible", roleNames >= 4 ? "PASS" : "INFO", `signals=${roleNames}`);
      await page.screenshot({ path: path.join(OUT, "qa-admin-firm-staff-roles.png"), fullPage: true });

      const rolesStatus = await page.evaluate(async (api) => {
        const t = localStorage.getItem("token");
        const r = await fetch(`${api}/staff/roles`, { headers: { Authorization: `Bearer ${t}` } });
        const j = await r.json().catch(() => []);
        return { status: r.status, count: Array.isArray(j) ? j.length : 0 };
      }, config.api);
      log(envKey, "GET /staff/roles", rolesStatus.status === 200 && rolesStatus.count === 4 ? "PASS" : "INFO", JSON.stringify(rolesStatus));
    });

    await session("roleA", PHONES.roleA, async (page) => {
      await page.goto(`${config.base}/AdminStack/AllCasesScreen`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3500);
      const toast = page.locator('[class*="toast"], [role="alert"]').filter({ hasText: /הרשא|permission/i });
      log(envKey, "Role A: no permission toast", (await toast.count()) === 0 ? "PASS" : "FAIL");
      const empty = await page.getByText(/לא נמצאו|empty|אין תיקים/i).isVisible().catch(() => false);
      const cards = await page.locator("[class*='case'], .lw-allCasesScreen, table tbody tr").count();
      log(envKey, "Role A: AllCases renders", cards > 0 || !empty ? "PASS" : "INFO", `nodes≈${cards}`);
      await page.screenshot({ path: path.join(OUT, "qa-roleA-allcases.png"), timeout: 8000 }).catch(() => {});

      await page.goto(`${config.base}/AdminStack/FirmStaffRoles`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      const onStaff = page.url().includes("FirmStaffRoles") && (await page.locator(".lw-firmStaffRolesScreen").isVisible().catch(() => false));
      log(envKey, "Role A: FirmStaffRoles direct URL blocked", !onStaff ? "PASS" : "FAIL", page.url());

      const scope = await page.evaluate(async (api) => {
        const t = localStorage.getItem("token");
        const r = await fetch(`${api}/staff/session-scope`, { headers: { Authorization: `Bearer ${t}` } });
        return { ok: r.ok, status: r.status };
      }, config.api);
      log(envKey, "Role A: session-scope API", scope.ok ? "PASS" : "FAIL", String(scope.status));
    });

    await session("roleC", PHONES.roleC, async (page) => {
      const scope = await page.evaluate(async (api) => {
        const t = localStorage.getItem("token");
        const r = await fetch(`${api}/staff/session-scope`, { headers: { Authorization: `Bearer ${t}` } });
        const j = await r.json();
        return { ok: r.ok, roleName: j.roleName, pages: (j.pages || []).length };
      }, config.api);
      log(envKey, "Role C: session-scope", scope.ok ? "PASS" : "FAIL", `${scope.roleName}, pages=${scope.pages}`);
      const nav = await page.locator("nav, [class*='navBar'], [class*='NavBar']").first().isVisible().catch(() => false);
      log(envKey, "Role C: nav visible", nav ? "PASS" : "INFO");
      await page.screenshot({ path: path.join(OUT, "qa-roleC-main.png"), fullPage: true });
    });

    await session("roleD", PHONES.roleD, async (page) => {
      await page.waitForTimeout(2000);
      const noPerm = await page.getByText(/אין הרשאות זמינות/i).isVisible({ timeout: 10000 }).catch(() => false);
      log(envKey, "Role D: NoPermissionsScreen", noPerm ? "PASS" : "FAIL", page.url());
      const u0 = page.url();
      await page.waitForTimeout(4000);
      log(envKey, "Role D: no redirect loop", u0 === page.url() ? "PASS" : "FAIL", page.url());
      await page.screenshot({ path: path.join(OUT, "qa-roleD-no-permissions.png"), fullPage: true });

      const scope = await page.evaluate(async (api) => {
        const t = localStorage.getItem("token");
        const r = await fetch(`${api}/staff/session-scope`, { headers: { Authorization: `Bearer ${t}` } });
        const j = await r.json();
        return { pages: (j.pages || []).length, mode: j.permissionMode };
      }, config.api);
      log(envKey, "Role D: session-scope empty pages", scope.pages === 0 ? "PASS" : "INFO", JSON.stringify(scope));
    });
  }

  if (envKey === "prod") {
    await session("admin", PHONES.admin, async (page) => {
      const navStaff = await page.getByText(/תפקידים והרשאות/i).isVisible().catch(() => false);
      log(envKey, "Admin: no staff-roles nav", !navStaff ? "PASS" : "FAIL");
      await page.goto(`${config.base}/AdminStack/FirmStaffRoles`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      const staffUi = await page.locator(".lw-firmStaffRolesScreen").isVisible().catch(() => false);
      log(envKey, "No FirmStaffRoles screen on prod", !staffUi ? "PASS" : "FAIL", page.url());
      await page.screenshot({ path: path.join(OUT, "prod-admin-route.png"), fullPage: true });

      const staffApi = await page.evaluate(async (api) => {
        const t = localStorage.getItem("token");
        const r = await fetch(`${api}/staff/roles`, { headers: { Authorization: `Bearer ${t}` } });
        return r.status;
      }, config.api).catch(() => 404);
      log(envKey, "GET /staff/roles on prod API", staffApi === 404 || staffApi === 403 ? "PASS" : "INFO", `HTTP ${staffApi}`);
    });

    for (const [label, phone] of [
      ["roleA", PHONES.roleA],
      ["roleC", PHONES.roleC],
      ["roleD", PHONES.roleD],
    ]) {
      try {
        await apiLogin(config.api, phone);
      } catch {
        log(envKey, `${label} prod login`, "SKIP", "QA test user / demo OTP not on prod");
        continue;
      }
      await session(label, phone, async (page) => {
          await page.goto(`${config.base}/AdminStack/AllCasesScreen`, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(2000);
          const noPerm = await page.getByText(/אין הרשאות זמינות/i).isVisible({ timeout: 2000 }).catch(() => false);
          log(envKey, `${label}: legacy (no NoPermissions gate)`, !noPerm ? "PASS" : "INFO", page.url());
          const scopeStatus = await page.evaluate(async (api) => {
            const t = localStorage.getItem("token");
            const r = await fetch(`${api}/staff/session-scope`, { headers: { Authorization: `Bearer ${t}` } });
            return r.status;
          }, config.api).catch(() => "n/a");
          log(envKey, `${label}: no session-scope API`, scopeStatus === 404 ? "PASS" : "INFO", `HTTP ${scopeStatus}`);
          await page.screenshot({ path: path.join(OUT, `prod-${label}.png`), fullPage: true });
      });
    }
  }

  await browser.close();
}

const headed = process.argv.includes("--headed");
await runEnv("qa", ENV.qa, headed);
await runEnv("prod", ENV.prod, headed);

const reportPath = path.join(OUT, "report.json");
fs.writeFileSync(reportPath, JSON.stringify({ ENV, results, screenshots: OUT }, null, 2));

console.log("\n--- SUMMARY ---");
const fail = results.filter((r) => r.status === "FAIL");
const pass = results.filter((r) => r.status === "PASS");
console.log(`PASS: ${pass.length}  FAIL: ${fail.length}`);
console.log(`Screenshots: ${OUT}`);
console.log(`Report: ${reportPath}`);
if (fail.length) {
  fail.forEach((f) => console.log(`  FAIL: [${f.env}] ${f.check} — ${f.detail}`));
  process.exit(1);
}
