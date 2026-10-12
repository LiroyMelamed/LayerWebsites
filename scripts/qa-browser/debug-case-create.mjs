import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { injectSession } from "./qa-auth-sessions.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QA = "https://melamedia.mela-media.co.il";
const QA_API = "https://api-melamedia.mela-media.co.il/api";
const sessions = JSON.parse(fs.readFileSync(path.join(__dirname, ".qa-sessions.json"), "utf8")).sessions;

async function api(token, urlPath) {
  const r = await fetch(`${QA_API}${urlPath}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ locale: "he-IL" });
  await injectSession(page, QA, sessions.roleB);
  await page.goto(`${QA}/AdminStack/AllCasesScreen`, { waitUntil: "networkidle", timeout: 90000 });
  await page.locator(".lw-sideBarMenuItem").filter({ hasText: /תיק חדש/i }).first().click();
  await page.locator(".lw-caseFullView").waitFor({ state: "visible" });

  const caseName = `QA DEBUG CASE ${Date.now()}`;
  const types = await api(sessions.roleB.token, "/CaseTypes/GetCaseTypeByName?name=" + encodeURIComponent("חוז"));
  const typeLabel = types.find((t) => t.CaseTypeName)?.CaseTypeName || types[0]?.CaseTypeName;
  const customers = await api(sessions.roleB.token, "/Customers/GetCustomerByName?name=" + encodeURIComponent("QA"));
  const cust = customers.find((c) => c.PhoneNumber && c.Name) || customers[0];
  const staff = await api(sessions.roleB.token, "/Admins/GetStaffByName?name=");
  const mgr = staff.find((s) => s.role === "Lawyer") || staff[0];

  const view = page.locator(".lw-caseFullView");
  await view.locator("input").first().fill(caseName);
  const typeInput = view.locator(".lw-caseFullView__row").first().locator("input").nth(1);
  await typeInput.fill(typeLabel.slice(0, 6));
  await page.waitForTimeout(2500);
  await page.locator(".lw-hoverContainer__option").filter({ hasText: typeLabel }).first().click();

  const custInput = view.locator(".lw-caseFullView__clientsCol input").first();
  await custInput.fill(String(cust.Name).slice(0, 6));
  await page.waitForTimeout(2500);
  await page.locator(".lw-hoverContainer__option").filter({ hasText: cust.Name }).first().click();

  const mgrInput = view.locator(".lw-caseFullView__row").nth(3).locator("input").nth(1);
  await mgrInput.fill(String(mgr.name).slice(0, 6));
  await page.waitForTimeout(2500);
  await page.locator(".lw-hoverContainer__option").filter({ hasText: mgr.name }).first().click();

  await page.waitForTimeout(500);
  const errors = await page.locator(".lw-caseFullView [class*='error'], .lw-caseFullView .lw-textRed").allTextContents();
  const saveBtn = view.getByRole("button", { name: /^שמור תיק$/i }).first();
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("AddCase") && r.request().method() === "POST", { timeout: 20000 }).catch(() => null),
    saveBtn.click(),
  ]);
  console.log("errors visible", errors.filter(Boolean));
  console.log("AddCase", resp ? `${resp.status()} ${(await resp.text()).slice(0, 300)}` : "NO POST");
  await page.screenshot({ path: path.join(__dirname, "debug-case-create.png"), fullPage: true });
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
