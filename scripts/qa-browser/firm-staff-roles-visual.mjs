/**
 * Visual QA for /AdminStack/FirmStaffRoles — QA only.
 * Usage: node firm-staff-roles-visual.mjs [--headed]
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadOrCreateSessions, injectSession } from "./qa-auth-sessions.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QA = "https://melamedia.mela-media.co.il";
const ROUTE = `${QA}/AdminStack/FirmStaffRoles`;
const CACHE = path.join(__dirname, ".qa-sessions.json");
const OUT = path.join(__dirname, "results-firm-staff-roles-visual", new Date().toISOString().slice(0, 19).replace(/:/g, "-"));
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "390", width: 390, height: 844 },
];

function overlapArea(a, b) {
  const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return w * h;
}

function rectsOverlap(a, b, minArea = 120) {
  return overlapArea(a, b) > minArea;
}

function centerInside(outer, inner, tol = 4) {
  const cx = inner.left + inner.width / 2;
  const cy = inner.top + inner.height / 2;
  return (
    cx >= outer.left - tol &&
    cx <= outer.right + tol &&
    cy >= outer.top - tol &&
    cy <= outer.bottom + tol
  );
}

async function assertLayout(page, viewportName, issues) {
  const doc = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  if (doc.scrollW > doc.clientW + 2) {
    issues.push({ viewport: viewportName, kind: "horizontal-scroll", detail: `${doc.scrollW} > ${doc.clientW}` });
  }

  const cards = await page.locator("[data-role-card]").all();
  const cardRects = [];
  for (const c of cards) {
    const box = await c.boundingBox();
    if (!box) continue;
    if (box.width < 180) {
      issues.push({ viewport: viewportName, kind: "role-card-min-width", detail: String(box.width) });
    }
    if (box.height > box.width * 2.5 && box.width > 80 && box.height > 120) {
      issues.push({ viewport: viewportName, kind: "square-artifact", detail: `card ${box.width}x${box.height}` });
    }
    cardRects.push(box);
  }
  for (let i = 0; i < cardRects.length; i++) {
    for (let j = i + 1; j < cardRects.length; j++) {
      if (rectsOverlap(cardRects[i], cardRects[j])) {
        issues.push({ viewport: viewportName, kind: "role-card-overlap", detail: `${i}/${j}` });
      }
    }
  }

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const cardBox = cardRects[i];
    if (!cardBox) continue;
    const name = card.locator(".lw-firmStaffRoles__roleName");
    const footer = card.locator(".lw-firmStaffRoles__roleCardFooter");
    const nameBox = await name.boundingBox();
    const footerBox = await footer.boundingBox();
    if (nameBox && footerBox && nameBox.bottom > footerBox.top + 4) {
      issues.push({ viewport: viewportName, kind: "title-footer-collision", detail: `card ${i}` });
    }
    const footerBox = await footer.boundingBox();
    if (footerBox && cardBox && !centerInside(cardBox, footerBox, 8)) {
      issues.push({ viewport: viewportName, kind: "footer-outside-card", detail: `card ${i}` });
    }
    const buttons = await footer.locator(".lw-textButtonWithTwoOptionalIcons").all();
    for (const btn of buttons) {
      const b = await btn.boundingBox();
      if (b && b.width > 220 && b.height > 88 && b.width / b.height < 1.35) {
        issues.push({ viewport: viewportName, kind: "oversized-button", detail: `${Math.round(b.width)}x${Math.round(b.height)}` });
      }
    }
  }

  const empCards = await page.locator("[data-employee-card]").all();
  const empRects = [];
  for (const c of empCards) {
    const box = await c.boundingBox();
    if (box) empRects.push(box);
  }
  for (let i = 0; i < empRects.length; i++) {
    for (let j = i + 1; j < empRects.length; j++) {
      if (rectsOverlap(empRects[i], empRects[j])) {
        issues.push({ viewport: viewportName, kind: "employee-card-overlap", detail: `${i}/${j}` });
      }
    }
  }
}

async function main() {
  const sessions = await loadOrCreateSessions(CACHE);
  const browser = await chromium.launch({ headless: !process.argv.includes("--headed") });
  const issues = [];
  let visualBugsFound = 0;
  let visualBugsFixed = 0;

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ locale: "he-IL", viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await injectSession(page, QA, sessions.admin);
    await page.goto(ROUTE, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForSelector(".lw-firmStaffRoles__title", { timeout: 30000 });
    await page.waitForTimeout(800);
    await assertLayout(page, vp.name, issues);
    await page.screenshot({ path: path.join(OUT, `list-${vp.name}.png`), fullPage: true });

    await page.locator(".lw-firmStaffRoles__headerCta").click({ timeout: 10000 });
    await page.waitForSelector(".lw-firmStaffRoles__editorTitle", { timeout: 15000 });
    await page.screenshot({ path: path.join(OUT, `role-editor-${vp.name}.png`), fullPage: true });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    await ctx.close();
  }

  // Arabic locale pass (list + editor)
  const ctxAr = await browser.newContext({ locale: "ar", viewport: { width: 1440, height: 900 } });
  const pageAr = await ctxAr.newPage();
  await injectSession(pageAr, QA, sessions.admin);
  await pageAr.goto(ROUTE, { waitUntil: "networkidle", timeout: 90000 });
  await pageAr.locator(".lw-languageSwitcher__button").click({ timeout: 10000 });
  await pageAr.locator(".lw-languageSwitcher__menu button").filter({ hasText: /العربية|Arabic/i }).click({ timeout: 8000 });
  await pageAr.waitForTimeout(1200);
  const arTitle = await pageAr.locator(".lw-firmStaffRoles__title").textContent();
  if (!/الأدوار|صلاحيات/i.test(arTitle || "")) {
    issues.push({ viewport: "ar-1440", kind: "arabic-missing", detail: arTitle?.slice(0, 80) || "empty" });
  }
  await pageAr.screenshot({ path: path.join(OUT, "list-ar-1440.png"), fullPage: true });
  await ctxAr.close();

  await browser.close();

  visualBugsFound = issues.length;
  const report = {
    route: ROUTE,
    outputDir: OUT,
    visualBugsFound,
    visualBugsFixed: visualBugsFixed,
    remaining: issues.length,
    issues,
    verdict: issues.length === 0 ? "FIRM STAFF ROLES VISUAL PASS" : "NOT PASS",
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (issues.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
