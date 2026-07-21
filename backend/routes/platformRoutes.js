const express = require('express');
const pool = require('../config/db');

const router = express.Router();

const PRODUCT_ID = 'layerwebsites';
const SERVICE_KEY =
  process.env.CENTRAL_SERVICE_KEY?.trim() || 'dev-central-service-key-change-me';

function requireCentralService(req, res) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ') || header.slice(7).trim() !== SERVICE_KEY) {
    if (!res.headersSent) res.status(401).json({ error: 'UNAUTHORIZED' });
    return false;
  }
  return true;
}

function sendJson(res, status, body) {
  if (res.headersSent) return;
  if (status) res.status(status).json(body);
  else res.json(body);
}

async function pingDb() {
  const started = Date.now();
  try {
    await pool.query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - started };
  } catch {
    return { ok: false, latencyMs: Date.now() - started };
  }
}

router.get('/health', async (req, res) => {
  if (!requireCentralService(req, res)) return;
  try {
    const db = await pingDb();
    const firmSlug =
      process.env.FIRM_NAME ||
      process.env.RUNTIME_TENANT ||
      'default';

    sendJson(res, null, {
      ok: db.ok,
      productId: PRODUCT_ID,
      tenantSlug: String(firmSlug).toLowerCase().replace(/\s+/g, '-'),
      version: process.env.npm_package_version || '1.0.0',
      gitSha: process.env.GIT_SHA || undefined,
      ts: new Date().toISOString(),
      db,
      extras: {
        firmName: process.env.LAW_FIRM_NAME || process.env.FIRM_DISPLAY_NAME || firmSlug,
      },
    });
  } catch (err) {
    sendJson(res, 200, {
      ok: false,
      productId: PRODUCT_ID,
      version: '1.0.0',
      ts: new Date().toISOString(),
      db: { ok: false },
      extras: { unavailable: true, message: err?.message || String(err) },
    });
  }
});

router.get('/tenants', async (req, res) => {
  if (!requireCentralService(req, res)) return;
  try {
    const firmName =
      process.env.LAW_FIRM_NAME || process.env.FIRM_DISPLAY_NAME || process.env.FIRM_NAME || 'Firm';
    const firmSlug = String(process.env.FIRM_NAME || process.env.RUNTIME_TENANT || 'default')
      .toLowerCase()
      .replace(/\s+/g, '-');

    let customerCount = 0;
    let caseCount = 0;
    try {
      const customers = await pool.query(`SELECT COUNT(*)::int AS c FROM customers`).catch(() => null);
      if (customers?.rows?.[0]?.c != null) customerCount = Number(customers.rows[0].c);
    } catch {
      /* ignore */
    }
    try {
      const cases = await pool.query(`SELECT COUNT(*)::int AS c FROM cases`);
      if (cases?.rows?.[0]?.c != null) caseCount = Number(cases.rows[0].c);
    } catch {
      /* ignore */
    }

    sendJson(res, null, {
      tenants: [
        {
          id: firmSlug,
          slug: firmSlug,
          name: firmName,
          status: 'active',
          metrics: {
            userCount: customerCount,
            appointmentCount: caseCount,
          },
        },
      ],
    });
  } catch (err) {
    sendJson(res, 503, {
      error: 'TENANTS_UNAVAILABLE',
      message: err?.message || String(err),
      tenants: [],
    });
  }
});

router.get('/metrics', async (req, res) => {
  if (!requireCentralService(req, res)) return;
  try {
    let openCases = 0;
    let customers = 0;
    try {
      const r = await pool.query(
        `SELECT COUNT(*)::int AS c FROM cases WHERE COALESCE(isclosed, false) = false`,
      );
      openCases = Number(r.rows[0]?.c ?? 0);
    } catch {
      try {
        const r = await pool.query(`SELECT COUNT(*)::int AS c FROM cases`);
        openCases = Number(r.rows[0]?.c ?? 0);
      } catch {
        /* ignore */
      }
    }
    try {
      const r = await pool.query(`SELECT COUNT(*)::int AS c FROM customers`);
      customers = Number(r.rows[0]?.c ?? 0);
    } catch {
      /* ignore */
    }

    sendJson(res, null, {
      productId: PRODUCT_ID,
      ts: new Date().toISOString(),
      activeTenants: 1,
      activeUsers24h: customers,
      extras: {
        openCases,
        customers,
        firm: process.env.FIRM_NAME || process.env.LAW_FIRM_NAME || null,
      },
    });
  } catch (err) {
    sendJson(res, 200, {
      productId: PRODUCT_ID,
      ts: new Date().toISOString(),
      extras: { unavailable: true, message: err?.message || String(err) },
    });
  }
});

module.exports = router;
