const melamediaServiceRequestTypes = [
  'billing_setup',
  'billing_plan_change',
  'whatsapp_connect',
  'phone_number_change',
  'sms_sender_change',
  'payment_provider_setup',
];

const LABELS = {
  billing_setup: 'הפעלת תשלום ל-MelaMedia',
  billing_plan_change: 'שינוי חבילת MelaMedia',
  whatsapp_connect: 'חיבור WhatsApp Business',
  phone_number_change: 'שינוי מספר טלפון עסקי',
  sms_sender_change: 'שינוי מספר שולח SMS',
  payment_provider_setup: 'הגדרת ספק תשלומים',
};

function isMelamediaServiceRequestType(v) {
  return melamediaServiceRequestTypes.includes(v);
}

function buildMelamediaServiceRequest(opts) {
  const label = LABELS[opts.type];
  const lines = [
    `בקשת שירות מ-MelamedLaw · דייר: ${opts.tenantSlug}`,
    '',
    `סוג: ${label}`,
    `עמוד: ${opts.pagePath}`,
  ];
  if (opts.context) {
    for (const [k, v] of Object.entries(opts.context)) {
      if (v) lines.push(`${k}: ${v}`);
    }
  }
  if (opts.notes?.trim()) {
    lines.push('', 'הערות מהלקוח:', opts.notes.trim());
  }
  return {
    title: `[MelamedLaw] ${label}`,
    description: lines.join('\n'),
    metadata: {
      requestType: opts.type,
      projectId: opts.projectId,
      tenantSlug: opts.tenantSlug,
      pagePath: opts.pagePath,
      ...(opts.context ?? {}),
    },
  };
}

module.exports = {
  melamediaServiceRequestTypes,
  isMelamediaServiceRequestType,
  buildMelamediaServiceRequest,
};
