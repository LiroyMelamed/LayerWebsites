const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const requireFirmAction = require('../middlewares/requireFirmAction');

const router = express.Router();
const run = fn => (req,res,next) => Promise.resolve().then(()=>fn(req,res)).catch(next);

const PROJECT_ID = 'layerwebsites';
const SERVICE_KEY =
  process.env.CENTRAL_SERVICE_KEY?.trim() || '';
const CENTRAL_API_URL = (
  process.env.CENTRAL_API_URL ||
  process.env.REACT_APP_CENTRAL_API_URL ||
  'http://127.0.0.1:4100'
).replace(/\/$/, '');

function firmSlug() {
  if (require('../lib/tenant/tenantContext').isMultiTenantMode()) {
    const slug = require('../lib/tenant/tenantContext').getCurrentTenant()?.slug;
    if (!slug) throw new Error('SUPPORT_OFFICE_CONTEXT_REQUIRED');
    return slug;
  }
  return String(process.env.FIRM_NAME || process.env.RUNTIME_TENANT || 'default')
    .trim()
    .toLowerCase();
}

function centralHeaders(actor) {
  const slug = firmSlug();
  const headers = {
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'X-Central-Project-Id': PROJECT_ID,
    'X-Central-Tenant-Slug': slug,
  };
  if (actor) {
    headers['X-Central-Actor'] = JSON.stringify(actor);
  }
  return headers;
}

function actorFromReq(req) {
  const user = req.user || {};
  return {
    userId: String(user.UserId || user.userid || user.userId || user.id || 'admin'),
    name: String(user.name || user.username || user.Role || user.role || 'Admin'),
  };
}

async function proxyJson(res, path, init = {}) {
  const url = `${CENTRAL_API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const text = await response.text();
  res.status(response.status).type('application/json').send(text);
}

router.use(authMiddleware, requireFirmAction('support', 'view', { legacy: 'admin' }));
router.use((_req,res,next)=>SERVICE_KEY.length>=32?next():res.status(503).json({error:'SUPPORT_UNAVAILABLE'}));

router.get('/tickets', run(async (req, res) => {
  const slug = firmSlug();
  await proxyJson(
    res,
    `/api/v1/tickets?projectId=${encodeURIComponent(PROJECT_ID)}&tenantSlug=${encodeURIComponent(slug)}&limit=100`,
    { headers: centralHeaders() },
  );
}));

router.get('/tickets/:id', run(async (req, res) => {
  await proxyJson(res, `/api/v1/tickets/${encodeURIComponent(req.params.id)}?include=details`, {
    headers: centralHeaders(),
  });
}));

router.post('/tickets', run(async (req, res) => {
  const slug = firmSlug();
  const actor = actorFromReq(req);
  const { title, description } = req.body || {};
  await proxyJson(res, '/api/v1/tickets', {
    method: 'POST',
    headers: centralHeaders(actor),
    body: JSON.stringify({
      title,
      description,
      projectId: PROJECT_ID,
      tenantSlug: slug,
      source: 'admin',
      createdBy: actor,
      metadata: { path: '/AdminStack/support', firm: slug },
    }),
  });
}));

router.post('/tickets/:id/comments', run(async (req, res) => {
  const actor = actorFromReq(req);
  const { body } = req.body || {};
  await proxyJson(res, `/api/v1/tickets/${encodeURIComponent(req.params.id)}/comments`, {
    method: 'POST',
    headers: centralHeaders(actor),
    body: JSON.stringify({ body, visibility: 'tenant', author: actor }),
  });
}));

module.exports = router;
