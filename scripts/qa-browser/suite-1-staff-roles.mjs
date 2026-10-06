/**
 * Suite 1 — Staff Roles / Employees (UI after single API login per role).
 * Usage: node suite-1-staff-roles.mjs [--headed]
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { loadOrCreateSessions, injectSession } from "./qa-auth-sessions.mjs";

const QA = "https://melamedia.mela-media.co.il";
const OUT = path.join(process.cwd(), "results-suite-1", new Date().toISOString().slice(0, 19).replace(/:/g, "-"));
fs.mkdirSync(OUT, { recursive: true });

const inventory = { discovered: [], exercised: [], skipped: [] };

function control(name, action) {
  inventory.discovered.push(name);
  try {
    action();
    inventory.exercised.push(name);
  } catch (e) {
    inventory.skipped.push({ name, reason: String(e.message || e) });
  }
}

async function runAdmin(page) {
  await injectSession(page, QA, (await loadOrCreateSessions(path.join(process.cwd(), ".qa-sessions.json"))).admin);
  await page.goto(`${QA}/AdminStack/FirmStaffRoles`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  control("createRole.open", async () => {
    await page.getByRole("button", { name: /תפקיד חדש/i }).click();
  });
  control("createRole.cancel", async () => {
    await page.getByRole("button", { name: /^ביטול$/ }).click();
  });

  const roleCard = page.locator(".lw-firmStaffRoles__roleCard").first();
  control("editRole.open", async () => {
    await roleCard.getByRole("button", { name: /עריכה/i }).first().click();
  });
  control("permission.checkbox", async () => {
    await page.locator(".lw-firmStaffRoles__areaBlock input[type=checkbox]").first().click({ force: true });
  });
  control("editRole.cancel", async () => {
    await page.getByRole("button", { name: /^ביטול$/ }).click();
  });

  const zeroEmpRole = page.locator(".lw-firmStaffRoles__roleCard").filter({ hasText: /השבתת תפקיד/ }).first();
  if (await zeroEmpRole.count()) {
    inventory.skipped.push({ name: "deactivate.confirm", reason: "no zero-employee role in list" });
  }

  await page.screenshot({ path: path.join(OUT, "admin-firm-staff.png"), timeout: 8000 }).catch(() => {});
}

async function main() {
  const browser = await chromium.launch({ headless: !process.argv.includes("--headed") });
  const ctx = await browser.newContext({ locale: "he-IL", viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await runAdmin(page);
  await browser.close();
  fs.writeFileSync(path.join(OUT, "inventory.json"), JSON.stringify(inventory, null, 2));
  console.log("Suite 1 partial run:", OUT);
  console.log("discovered", inventory.discovered.length, "exercised", inventory.exercised.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
