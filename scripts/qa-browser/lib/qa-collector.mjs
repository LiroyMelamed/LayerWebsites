import { sanitizeForReport } from "../qa-auth-sessions.mjs";

export function createCollector() {
  return {
    controls: [],
    screens: new Map(),
    metrics: {
      consoleError: 0,
      pageerror: 0,
      requestfailed: 0,
      http5xx: 0,
      unexpected401: 0,
      unexpected403: 0,
      unexpected404: 0,
      duplicateMutations: 0,
    },
    events: { consoleErrors: [], pageErrors: [], network: [], mutations: [] },
    bugs: [],
  };
}

export function registerControl(collector, row) {
  const entry = {
    screen: row.screen,
    control: row.control,
    controlId: row.controlId,
    type: row.type || "unknown",
    role: row.role || "any",
    expected: row.expected || "",
    exercised: false,
    result: null,
    skipReason: null,
  };
  collector.controls.push(entry);
  if (!collector.screens.has(row.screen)) collector.screens.set(row.screen, { discovered: true, exercised: false });
  return entry;
}

export function exercise(collector, controlId, result = "PASS", meta = {}) {
  const c = collector.controls.find((x) => x.controlId === controlId);
  if (!c) throw new Error(`missing control ${controlId}`);
  if (c.exercised) throw new Error(`control already exercised: ${controlId}`);
  c.exercised = true;
  c.result = result;
  Object.assign(c, meta);
  collector.screens.set(c.screen, { ...collector.screens.get(c.screen), exercised: true });
}

export function skipControl(collector, controlId, skipReason) {
  const c = collector.controls.find((x) => x.controlId === controlId);
  if (!c) throw new Error(`missing control ${controlId}`);
  if (c.exercised) throw new Error(`cannot skip exercised control ${controlId}`);
  c.exercised = false;
  c.result = "SKIP";
  c.skipReason = skipReason;
}

export function attachInstrumentation(page, collector, ctx) {
  const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  const mutationUrls = [];
  const stripAuth = (headers) => {
    const h = { ...headers };
    delete h.Authorization;
    delete h.authorization;
    return h;
  };

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      collector.metrics.consoleError += 1;
      collector.events.consoleErrors.push(msg.text().slice(0, 400));
    }
  });
  page.on("pageerror", (err) => {
    collector.metrics.pageerror += 1;
    collector.events.pageErrors.push(String(err.message || err).slice(0, 400));
  });
  page.on("requestfailed", (req) => {
    collector.metrics.requestfailed += 1;
    collector.events.network.push({
      kind: "requestfailed",
      url: req.url().split("?")[0],
      method: req.method(),
      screen: ctx.screen,
      role: ctx.role,
    });
  });
  page.on("response", (res) => {
    const url = res.url();
    if (!url.includes("api-melamedia")) return;
    const status = res.status();
    const method = res.request().method();
    if (status >= 500) {
      collector.metrics.http5xx += 1;
      collector.events.network.push({ kind: "5xx", url: url.split("?")[0], method, status, screen: ctx.screen, role: ctx.role });
    }
    if (status === 401) {
      collector.metrics.unexpected401 += 1;
      collector.events.network.push({ kind: "401", url: url.split("?")[0], method, status, screen: ctx.screen, role: ctx.role });
    }
    if (status === 403 && !ctx.expected403?.(url, method)) {
      collector.metrics.unexpected403 += 1;
      collector.events.network.push({ kind: "403", url: url.split("?")[0], method, status, screen: ctx.screen, role: ctx.role });
    }
    if (status === 404 && !ctx.expected404?.(url)) {
      collector.metrics.unexpected404 += 1;
      collector.events.network.push({ kind: "404", url: url.split("?")[0], method, status, screen: ctx.screen, role: ctx.role });
    }
    if (mutationMethods.has(method) && /Cases|Customers|Customer|Files/i.test(url)) {
      const key = `${method} ${url.split("?")[0]}`;
      const now = Date.now();
      mutationUrls.push({ key, t: now, screen: ctx.screen, role: ctx.role });
      const recent = mutationUrls.filter((m) => m.key === key && now - m.t < 1500);
      if (recent.length >= 2) {
        collector.metrics.duplicateMutations += 1;
        collector.events.mutations.push({ key, count: recent.length, screen: ctx.screen, role: ctx.role });
      }
    }
  });
}

export function summarizeControls(collector) {
  const discovered = collector.controls.length;
  const exercised = collector.controls.filter((c) => c.exercised).length;
  const skipped = collector.controls.filter((c) => c.result === "SKIP").length;
  const pending = collector.controls.filter((c) => !c.exercised && c.result !== "SKIP");
  return { discovered, exercised, skipped, pending: pending.length, controls: collector.controls };
}

export function reportBundle(collector, extra) {
  return sanitizeForReport({
    ...extra,
    controls: summarizeControls(collector),
    metrics: collector.metrics,
    bugs: collector.bugs,
    networkSample: collector.events.network.slice(-50),
  });
}
