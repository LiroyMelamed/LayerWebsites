import { sanitizeForReport } from "../qa-auth-sessions.mjs";

export function createMetrics() {
  return {
    consoleErrors: [],
    pageErrors: [],
    network5xx: [],
    unexpected403: [],
    unexpected4xx: [],
    duplicateMutations: [],
    bugs: [],
  };
}

export function attachPageMetrics(page, metrics, { qaApiHost }) {
  page.on("console", (msg) => {
    if (msg.type() === "error") metrics.consoleErrors.push(msg.text().slice(0, 500));
  });
  page.on("pageerror", (err) => metrics.pageErrors.push(String(err.message || err).slice(0, 500)));
  page.on("response", (res) => {
    const url = res.url();
    if (!url.includes(qaApiHost)) return;
    const status = res.status();
    if (status >= 500) metrics.network5xx.push({ url: stripQuery(url), status });
    if (status === 403 && !isExpected403(url)) metrics.unexpected403.push({ url: stripQuery(url), status });
    if (status >= 400 && status < 500 && status !== 403 && status !== 404 && status !== 401)
      metrics.unexpected4xx.push({ url: stripQuery(url), status });
  });
}

function stripQuery(u) {
  try {
    const x = new URL(u);
    x.search = "";
    return x.toString();
  } catch {
    return u;
  }
}

function isExpected403(url) {
  return /\/(UpdateCase|DeleteCase|CreateCase|AddCustomer|UpdateCustomer|DeleteCustomer)/i.test(url);
}

export class ControlInventory {
  constructor() {
    this.controls = [];
  }

  add(row) {
    this.controls.push({
      tested: false,
      result: null,
      reasonIfSkipped: null,
      ...row,
    });
  }

  pass(controlId, result = "PASS") {
    const c = this.controls.find((x) => x.controlId === controlId);
    if (!c) throw new Error(`unknown control ${controlId}`);
    c.tested = true;
    c.result = result;
  }

  skip(controlId, reason) {
    const c = this.controls.find((x) => x.controlId === controlId);
    if (!c) throw new Error(`unknown control ${controlId}`);
    c.tested = true;
    c.result = "SKIP";
    c.reasonIfSkipped = reason;
  }

  fail(controlId, result = "FAIL") {
    const c = this.controls.find((x) => x.controlId === controlId);
    if (!c) throw new Error(`unknown control ${controlId}`);
    c.tested = true;
    c.result = result;
  }

  summary() {
    const discovered = this.controls.length;
    const tested = this.controls.filter((c) => c.tested).length;
    const skipped = this.controls.filter((c) => c.result === "SKIP").length;
    return { discovered, tested, skipped, controls: this.controls };
  }

  toJSON() {
    return sanitizeForReport(this.summary());
  }
}

export function writeReport(outDir, report) {
  import("fs").then((fs) => {
    fs.writeFileSync(`${outDir}/report.json`, JSON.stringify(sanitizeForReport(report), null, 2));
  });
}
