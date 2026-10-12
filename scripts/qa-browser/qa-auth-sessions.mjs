/** One-time QA auth tokens — no per-screen OTP. */
import fs from "fs";
import path from "path";

const QA_API = "https://api-melamedia.mela-media.co.il/api";
const OTP = "123456";
const PHONES = {
  admin: "0507299064",
  roleA: "0509999101",
  roleB: "0509999102",
  roleC: "0509999103",
  roleD: "0509999104",
};

export async function loginPhone(phone) {
  await fetch(`${QA_API}/auth/RequestOtp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber: phone }),
  });
  await new Promise((r) => setTimeout(r, 1200));
  const res = await fetch(`${QA_API}/auth/VerifyOtp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber: phone, otp: OTP }),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`${phone}: ${res.status} ${JSON.stringify(data)}`);
  return {
    token: data.token,
    role: data.role,
    isPlatformAdmin: Boolean(data.isPlatformAdmin),
    refreshToken: data.refreshToken,
  };
}

function jwtStillValid(token) {
  try {
    const part = String(token || "").split(".")[1];
    if (!part) return false;
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now() + 120_000;
  } catch {
    return false;
  }
}

function sessionsStillValid(sessions) {
  return sessions && Object.values(sessions).every((s) => s?.token && jwtStillValid(s.token));
}

export async function loadOrCreateSessions(cachePath) {
  if (fs.existsSync(cachePath)) {
    const parsed = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    if (parsed.expiresAt && Date.now() < parsed.expiresAt && sessionsStillValid(parsed.sessions)) {
      return parsed.sessions;
    }
  }
  const sessions = {};
  for (const [key, phone] of Object.entries(PHONES)) {
    sessions[key] = await loginPhone(phone);
    await new Promise((r) => setTimeout(r, 2500));
  }
  const payload = {
    expiresAt: Date.now() + 6 * 60 * 60 * 1000,
    sessions,
  };
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), { mode: 0o600 });
  return sessions;
}

/** Strip tokens before writing QA reports. */
export function sanitizeForReport(obj) {
  return JSON.parse(
    JSON.stringify(obj, (_k, v) => {
      if (typeof v === "string" && v.length > 40 && /^eyJ/.test(v)) return "[REDACTED_JWT]";
      return v;
    }),
  );
}

export function clearSessionCache(cachePath) {
  if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
}

export function injectSession(page, base, auth) {
  return page.goto(base, { waitUntil: "domcontentloaded" }).then(() =>
    page.evaluate((a) => {
      localStorage.setItem("token", a.token);
      localStorage.setItem("role", a.role);
      localStorage.setItem("isPlatformAdmin", a.isPlatformAdmin ? "true" : "false");
      if (a.refreshToken) localStorage.setItem("refreshToken", a.refreshToken);
    }, auth),
  );
}

/** Re-apply tokens after navigation (login guard may run on deep links). */
export async function ensureInjected(page, base, auth) {
  await page.evaluate((a) => {
    if (!localStorage.getItem("token")) {
      localStorage.setItem("token", a.token);
      localStorage.setItem("role", a.role);
      localStorage.setItem("isPlatformAdmin", a.isPlatformAdmin ? "true" : "false");
      if (a.refreshToken) localStorage.setItem("refreshToken", a.refreshToken);
    }
  }, auth);
  if (page.url().includes("LoginStack")) {
    await injectSession(page, base, auth);
    await page.reload({ waitUntil: "networkidle" });
  }
}

if (process.argv[1]?.includes("qa-auth-sessions")) {
  const out = path.join(process.cwd(), ".qa-sessions.json");
  loadOrCreateSessions(out).then(() => console.log("Wrote session cache (tokens not printed):", path.basename(out)));
}
