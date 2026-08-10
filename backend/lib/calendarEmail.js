'use strict';

/**
 * Branded HTML calendar invite / reminder emails from email_templates.
 */

const { getEmailTemplate, getSetting } = require('../services/settingsService');
const { wrapEmailHtml } = require('../tasks/emailReminders/templates');
const { getFirmDisplayName, getLawFirmNameHe } = require('./firmBranding');
const { loadCalendarSmsContext } = require('./calendarEventReminders');

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeAttrUrl(url) {
    return String(url || '')
        .trim()
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** Clean Waze / Maps CTA buttons — never dump raw query strings into the body. */
function buildNavButtonsHtml(wazeUrl, mapsUrl) {
    const waze = String(wazeUrl || '').trim();
    const maps = String(mapsUrl || '').trim();
    if (!waze && !maps) return '';

    const btn = (href, label, bg) =>
        `<a href="${escapeAttrUrl(href)}" rel="noopener" target="_blank" `
        + `style="display:inline-block;background:${bg};color:#FFFFFF;text-decoration:none;`
        + `font-weight:600;font-size:14px;line-height:1;padding:12px 18px;border-radius:8px;`
        + `box-shadow:0 2px 4px rgba(0,0,0,0.10);margin:4px 6px;">&nbsp;&nbsp;${label}&nbsp;&nbsp;</a>`;

    const parts = [];
    if (waze) parts.push(btn(waze, 'ניווט בוויז', '#33CCFF'));
    if (maps) parts.push(btn(maps, 'Google Maps', '#34A853'));

    return `<div style="text-align:center;padding:8px 0 4px 0;">${parts.join('')}</div>`;
}

function buildRsvpButtonHtml(rsvpUrl) {
    const url = String(rsvpUrl || '').trim();
    if (!url) return '';
    return `<div style="text-align:center;padding:4px 0 12px 0;">`
        + `<a href="${escapeAttrUrl(url)}" rel="noopener" target="_blank" `
        + `style="display:inline-block;background:#2A4365;color:#FFFFFF;text-decoration:none;`
        + `font-weight:600;font-size:14px;line-height:1;padding:12px 22px;border-radius:8px;`
        + `box-shadow:0 2px 4px rgba(0,0,0,0.10);">&nbsp;&nbsp;לאישור הגעה&nbsp;&nbsp;</a>`
        + `</div>`;
}

function replaceCalendarPlaceholders(template, fields) {
    const textKeys = [
        'recipient_name', 'clients_names', 'date', 'time', 'address', 'title',
        'lawyer_name', 'firm_name', 'firm_phone', 'website_url', 'when_label', 'body_text',
    ];
    const urlKeys = ['waze_url', 'maps_url', 'rsvp_url', 'action_url', 'firm_logo_url'];

    let out = String(template || '');
    for (const key of textKeys) {
        out = out.split(`[[${key}]]`).join(escapeHtml(fields[key] || ''));
    }
    for (const key of urlKeys) {
        const raw = String(fields[key] || '').trim();
        // firm_logo_url used in src="..." — keep raw URL chars except attribute breakers
        out = out.split(`[[${key}]]`).join(key === 'firm_logo_url' ? raw : escapeAttrUrl(raw));
    }
    // Pre-built trusted HTML fragments
    out = out.split('[[nav_buttons]]').join(fields.nav_buttons || '');
    out = out.split('[[rsvp_button]]').join(fields.rsvp_button || '');

    if (!String(fields.firm_logo_url || '').trim()) {
        out = out.replace(/<img\b[^>]*\bsrc=(["'])\1[^>]*>/gi, '');
        out = out.replace(/<img\b[^>]*\bsrc=["']\s*["'][^>]*>/gi, '');
    }
    return out;
}

function formatClientsNames(names) {
    const list = [...new Set((names || []).map((n) => String(n || '').trim()).filter(Boolean))];
    if (!list.length) return '';
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} ו-${list[1]}`;
    return `${list.slice(0, -1).join(', ')} ו-${list[list.length - 1]}`;
}

async function buildCalendarEmailFields(ev, { recipientName, clientsNames, whenLabel, bodyText } = {}) {
    const ctx = await loadCalendarSmsContext({
        ...ev,
        client_name: recipientName || ev.client_name || ev.lead_name,
        recipient_name: recipientName,
    });
    const firmName = ctx.firmName || (await getFirmDisplayName()) || (await getLawFirmNameHe()) || 'המשרד';
    const firmLogoUrl = String(await getSetting('firm', 'FIRM_LOGO_URL', '') || '').trim();
    const clients = formatClientsNames(
        clientsNames
        || (ev.clients_names ? String(ev.clients_names).split(/\s*,\s*/) : null)
        || [ctx.recipientName]
    );

    return {
        recipient_name: recipientName || ctx.recipientName,
        clients_names: clients,
        date: ctx.date,
        time: ctx.time,
        address: ctx.address,
        title: ctx.title,
        lawyer_name: ctx.lawyerName,
        firm_name: firmName,
        firm_phone: ctx.firmPhone,
        website_url: ctx.websiteUrl,
        waze_url: ctx.wazeUrl,
        maps_url: ctx.mapsUrl,
        rsvp_url: ctx.rsvpUrl,
        firm_logo_url: firmLogoUrl,
        when_label: whenLabel || '',
        body_text: bodyText || '',
        nav_buttons: buildNavButtonsHtml(ctx.wazeUrl, ctx.mapsUrl),
        rsvp_button: buildRsvpButtonHtml(ctx.rsvpUrl),
    };
}

/**
 * Render subject + full HTML for a calendar email template key.
 * Falls back to wrapEmailHtml if the DB template is missing.
 */
async function composeCalendarEmail(templateKey, ev, opts = {}) {
    const fields = await buildCalendarEmailFields(ev, opts);
    const dbTemplate = await getEmailTemplate(templateKey).catch(() => null);

    const defaultSubject = templateKey === 'CALENDAR_INVITE'
        ? `הזמנה לפגישה — ${fields.title}`
        : `תזכורת לפגישה — ${fields.title}`;

    if (!dbTemplate?.html_body) {
        const fallbackBody = [
            `שלום <strong>${escapeHtml(fields.recipient_name)}</strong>,`,
            '',
            templateKey === 'CALENDAR_INVITE'
                ? `נקבעה לך פגישה: <strong>${escapeHtml(fields.title)}</strong>`
                : `תזכורת לפגישה: <strong>${escapeHtml(fields.title)}</strong>`,
            `תאריך: <strong>${escapeHtml(fields.date)}</strong> בשעה <strong>${escapeHtml(fields.time)}</strong>`,
            fields.address ? `כתובת: ${escapeHtml(fields.address)}` : '',
            fields.clients_names && fields.clients_names !== fields.recipient_name
                ? `משתתפים: ${escapeHtml(fields.clients_names)}`
                : '',
            '',
            fields.rsvp_button || '',
            fields.nav_buttons || '',
            '',
            `בברכה,<br>${escapeHtml(fields.firm_name)}`,
        ].filter(Boolean).join('<br>');

        return {
            subject: defaultSubject,
            htmlBody: wrapEmailHtml(fallbackBody, {
                firmName: fields.firm_name,
                firmLogoUrl: fields.firm_logo_url,
                title: templateKey === 'CALENDAR_INVITE' ? 'הזמנה לפגישה' : 'תזכורת לפגישה',
            }),
        };
    }

    const subject = replaceCalendarPlaceholders(
        dbTemplate.subject_template || defaultSubject,
        fields
    ).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || defaultSubject;

    let htmlBody = replaceCalendarPlaceholders(dbTemplate.html_body, fields);
    if (!/<!DOCTYPE/i.test(htmlBody) && !/<html[\s>]/i.test(htmlBody)) {
        htmlBody = wrapEmailHtml(htmlBody, {
            firmName: fields.firm_name,
            firmLogoUrl: fields.firm_logo_url,
            title: subject,
        });
    }
    return { subject, htmlBody };
}

module.exports = {
    composeCalendarEmail,
    buildCalendarEmailFields,
    buildNavButtonsHtml,
    buildRsvpButtonHtml,
    formatClientsNames,
    replaceCalendarPlaceholders,
};
