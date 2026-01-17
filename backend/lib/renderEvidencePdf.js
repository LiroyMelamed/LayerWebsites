const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

function toDataUrl(buffer, mimeType) {
  if (!buffer) return null;
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function loadFileAsDataUrl(filePath, mimeType) {
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) return null;
  return toDataUrl(fs.readFileSync(filePath), mimeType);
}

const buildEvidenceHtml = ({ meta, sender, signers, doc, qrUrl, brand, consent, otp, security }) => `
<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 18mm 14mm; }

    @font-face {
      font-family: "EvidenceHebrew";
      src: url("${meta.fontDataUrl}") format("truetype");
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }

    * { box-sizing: border-box; }

    html, body {
      font-family: "EvidenceHebrew", Arial, sans-serif;
      font-size: 12px;
      color: #101214;
      margin: 0;
      padding: 0;
    }

    .page {
      position: relative;
      border: 2px solid #1b3a57;
      padding: 10mm;
      min-height: 245mm;
      background: #fff;
    }

    .watermark {
      position: absolute;
      inset: 0;
      background-image: linear-gradient(135deg, rgba(27,58,87,0.05) 0%, rgba(255,255,255,0) 60%);
      pointer-events: none;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 14px;
      z-index: 1;
      position: relative;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .brand img {
      width: 42px;
      height: 42px;
      object-fit: contain;
    }

    .brand .name {
      font-weight: 700;
      font-size: 14px;
      color: #1b3a57;
    }

    .title {
      font-weight: 700;
      font-size: 16px;
      text-align: left;
      color: #1b3a57;
      line-height: 1.2;
    }
    .subtitle {
      font-size: 12px;
      color: #4a5568;
      margin-top: 2px;
      text-align: left;
    }

    .section {
      margin-top: 14px;
      z-index: 1;
      position: relative;
    }
    .section h3 {
      margin: 0 0 6px 0;
      font-size: 12px;
      font-weight: 700;
      color: #1f2933;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 18px;
    }

    .kv {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 6px;
      align-items: baseline;
    }
    .k { color: #4a5568; font-weight: 700; }
    .v { color: #111827; word-break: break-word; }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    th, td {
      border: 1px solid #e2e8f0;
      padding: 6px 6px;
      vertical-align: top;
      word-break: break-word;
    }

    th {
      background: #f8fafc;
      color: #1f2933;
      font-weight: 700;
      font-size: 10px;
    }

    td {
      font-size: 10px;
      color: #111827;
      white-space: pre-line;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      display: inline-block;
      background: var(--c, #1b3a57);
      border: 1px solid rgba(0,0,0,0.15);
    }

    .footer {
      position: absolute;
      left: 10mm;
      right: 10mm;
      bottom: 10mm;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 10px;
      font-size: 10px;
      color: #4a5568;
    }

    .qr {
      width: 96px;
      height: 96px;
      border: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #fff;
    }

    .note {
      max-width: 70%;
      line-height: 1.35;
    }

    .mono {
      font-family: "Courier New", monospace;
      font-size: 10px;
      direction: ltr;
      text-align: left;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="watermark"></div>

    <div class="header">
      <div class="brand">
        ${brand.logoDataUrl ? `<img alt="${brand.companyName}" src="${brand.logoDataUrl}" />` : ``}
        <div class="name">${brand.companyName}</div>
      </div>

      <div style="text-align:left">
        <div class="title">Signed Document Certificate</div>
        <div class="subtitle">תעודת ראיות למסמך חתום</div>
      </div>
    </div>

    <div class="section">
      <h3>פרטי מסמך</h3>
      <div class="grid">
        <div class="kv"><div class="k">Document ID</div><div class="v mono">${doc.documentId}</div></div>
        <div class="kv"><div class="k">Document Name</div><div class="v">${doc.documentName}</div></div>
        <div class="kv"><div class="k">Case ID</div><div class="v mono">${doc.caseId || "N/A"}</div></div>
        <div class="kv"><div class="k">Case Name</div><div class="v">${doc.caseName || "N/A"}</div></div>
        <div class="kv"><div class="k">Signing Policy Version</div><div class="v mono">${doc.signingPolicyVersion || "N/A"}</div></div>
        <div class="kv"><div class="k">Signature Type</div><div class="v">${doc.signatureTypeDisclosure || "[REQUIRES LOCAL COUNSEL] Electronic signature (not PKI / not qualified / not \"approved\")."}</div></div>
        <div class="kv"><div class="k">Creation time (UTC)</div><div class="v">${doc.creationUtc}</div></div>
        <div class="kv"><div class="k">Signed PDF SHA256</div><div class="v mono">${doc.signedPdfSha256 || doc.signedHashSha256 || "-"}</div></div>
        <div class="kv"><div class="k">Presented PDF SHA256</div><div class="v mono">${doc.presentedPdfSha256 || "-"}</div></div>
        <div class="kv"><div class="k">Original PDF SHA256</div><div class="v mono">${doc.originalPdfSha256 || "-"}</div></div>
        <div class="kv"><div class="k">OTP Policy</div><div class="v">${doc.otpPolicy || "-"}</div></div>
        <div class="kv"><div class="k">Plan (at signing)</div><div class="v mono">${doc.planKeyAtSigning || "-"}</div></div>
        <div class="kv"><div class="k">Retention Core Days (at signing)</div><div class="v mono">${doc.retentionDaysCoreAtSigning ?? "-"}</div></div>
        <div class="kv"><div class="k">Retention PII Days (at signing)</div><div class="v mono">${doc.retentionDaysPiiAtSigning ?? "-"}</div></div>
        <div class="kv"><div class="k">Retention Policy Hash</div><div class="v mono">${doc.retentionPolicyHashAtSigning || "-"}</div></div>
      </div>
    </div>

    <div class="section">
      <h3>פרטי שולח</h3>
      <div class="grid">
        <div class="kv"><div class="k">Name</div><div class="v">${sender.name || "-"}</div></div>
        <div class="kv"><div class="k">E-mail</div><div class="v">${sender.email || "-"}</div></div>
        <div class="kv"><div class="k">Phone</div><div class="v">${sender.phone || "-"}</div></div>
        <div class="kv"><div class="k">Sender IP</div><div class="v mono">${sender.ip || "-"}</div></div>
        <div class="kv"><div class="k">Sent by</div><div class="v">${sender.sentBy || "-"}</div></div>
        <div class="kv"><div class="k">Sent at (UTC)</div><div class="v">${sender.sentAtUtc || "-"}</div></div>
      </div>
    </div>

    <div class="section">
      <h3>פרטי חותמים</h3>
      <table>
        <thead>
          <tr>
            <th style="width: 16%;">Signer</th>
            <th style="width: 16%;">Contact</th>
            <th style="width: 14%;">Authentication</th>
            <th style="width: 20%;">Network / Device</th>
            <th style="width: 17%;">Timeline (UTC)</th>
            <th style="width: 17%;">Integrity</th>
          </tr>
        </thead>
        <tbody>
          ${signers.map(s => `
            <tr>
              <td>
                <span class="chip" style="--c:${s.color}">
                  <span class="dot"></span>
                  <span>${s.name || "-"}</span>
                </span>
                <div class="mono" style="margin-top:4px;">
                  UserId: ${s.userId || "-"}\nSession: ${s.signingSessionId || "-"}
                </div>
              </td>
              <td>
                Phone: ${s.phone || "-"}\nOTP Phone: ${s.otpPhoneE164 || "-"}\nEmail: ${s.email || "-"}
              </td>
              <td>
                OTP used: ${typeof s.otpUsed === 'boolean' ? (s.otpUsed ? 'true' : 'false') : (s.otpUsed || "-")}\nOTP verified at: ${s.otpVerifiedAtUtc || "-"}\nProvider: ${s.authProvider || "-"}
              </td>
              <td>
                View IP: ${s.viewIp || "-"}\nSign IP: ${s.signIp || "-"}\nDevice: ${s.device || "-"}
              </td>
              <td>
                Sent: ${s.timeSentUtc || "-"}\nViewed: ${s.timeViewedUtc || "-"}\nSigned: ${s.timeSignedUtc || "-"}
              </td>
              <td class="mono">
                Presented: ${s.presentedPdfSha256 || "-"}\nSig img: ${s.signatureImageSha256 || "-"}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h3>Consent (הסכמה)</h3>
      <div class="grid">
        <div class="kv"><div class="k">Consent required</div><div class="v mono">${consent?.required === true ? 'true' : 'false'}</div></div>
        <div class="kv"><div class="k">Consent accepted</div><div class="v mono">${consent?.accepted === true ? 'true' : 'false'}</div></div>
        <div class="kv"><div class="k">Accepted at (UTC)</div><div class="v">${consent?.acceptedAtUtc || 'N/A'}</div></div>
        <div class="kv"><div class="k">Consent version</div><div class="v mono">${consent?.consentVersion || 'N/A'}</div></div>
        <div class="kv"><div class="k">Consent text SHA256</div><div class="v mono">${consent?.consentTextSha256 || 'N/A'}</div></div>
        <div class="kv"><div class="k">Notes</div><div class="v">${consent?.note || (consent?.required ? '-' : 'Consent: Not required')}</div></div>
      </div>
    </div>

    <div class="section">
      <h3>OTP (One-Time Password)</h3>
      <div class="grid">
        <div class="kv"><div class="k">OTP system enabled</div><div class="v mono">${otp?.systemEnabled === true ? 'true' : 'false'}</div></div>
        <div class="kv"><div class="k">OTP required</div><div class="v mono">${otp?.required === true ? 'true' : 'false'}</div></div>
        <div class="kv"><div class="k">OTP used</div><div class="v mono">${otp?.used === true ? 'true' : 'false'}</div></div>
        <div class="kv"><div class="k">OTP verified</div><div class="v mono">${otp?.verified === true ? 'true' : 'false'}</div></div>
        <div class="kv"><div class="k">Provider</div><div class="v">${otp?.provider || 'N/A'}</div></div>
        <div class="kv"><div class="k">Message ID</div><div class="v mono">${otp?.messageId || 'N/A'}</div></div>
      </div>
    </div>

    <div class="section">
      <h3>Security & Integrity</h3>
      <div class="grid">
        <div class="kv"><div class="k">Audit hash chain present</div><div class="v mono">${security?.auditHashChainPresent === 'Not available' ? 'Not available' : (security?.auditHashChainPresent === true ? 'true' : 'false')}</div></div>
        <div class="kv"><div class="k">Audit events count</div><div class="v mono">${Number.isFinite(Number(security?.auditEventCount)) ? Number(security.auditEventCount) : 'N/A'}</div></div>
      </div>
    </div>

    <div class="footer">
      <div class="note">
        This certificate was generated automatically by ${brand.companyName}.
        <br/>
        Generated at (UTC): ${meta.generatedUtc}
        <br/>
        Verify URL: <span class="mono">${doc.verifyUrl || "-"}</span>
        ${doc.missingNotes && doc.missingNotes.length ? `<br/>Missing data: ${doc.missingNotes.join('; ')}` : ``}
      </div>
      ${qrUrl ? `<div class="qr"><img alt="QR" src="${qrUrl}" style="width:100%;height:100%;object-fit:cover"/></div>` : `<div></div>`}
    </div>
  </div>
</body>
</html>
`;

function resolveHebrewFontPath() {
  const candidates = [
    path.resolve(__dirname, '../assets/fonts/NotoSansHebrew-Regular.ttf'),
    path.resolve(__dirname, '../assets/fonts/Rubik-Regular.ttf'),
    path.resolve(__dirname, '../assets/fonts/Assistant-Regular.ttf'),
  ];

  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(
      'Hebrew font missing. Place a TTF at backend/assets/fonts/NotoSansHebrew-Regular.ttf (or Rubik-Regular.ttf / Assistant-Regular.ttf).'
    );
  }
  return found;
}

function buildPuppeteerLaunchOptions() {
  const executablePath = String(process.env.PUPPETEER_EXECUTABLE_PATH || '').trim() || undefined;
  const noSandbox = String(process.env.PUPPETEER_NO_SANDBOX || '').toLowerCase() === 'true'
    || String(process.env.IS_PRODUCTION || '').toLowerCase() === 'true';

  const options = {};
  if (executablePath) {
    options.executablePath = executablePath;
  }

  if (noSandbox) {
    options.args = ['--no-sandbox', '--disable-setuid-sandbox'];
  }

  return options;
}

async function renderHtmlToPdf(html) {
  const browser = await puppeteer.launch(buildPuppeteerLaunchOptions());

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

async function renderEvidencePdf({ doc, sender, signers, qrDataUrl, brand }) {
  const fontPath = resolveHebrewFontPath();
  const fontDataUrl = loadFileAsDataUrl(fontPath, 'font/ttf');

  const safeBrand = {
    companyName: brand?.companyName || 'MelamedLaw',
    logoDataUrl: brand?.logoDataUrl || null,
  };

  const meta = {
    generatedUtc: new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z',
    fontDataUrl,
  };

  const html = buildEvidenceHtml({
    meta,
    sender,
    signers,
    doc,
    qrUrl: qrDataUrl || null,
    brand: safeBrand,
    consent: doc?.consent || null,
    otp: doc?.otp || null,
    security: doc?.security || null,
  });

  return renderHtmlToPdf(html);
}

module.exports = { buildEvidenceHtml, renderEvidencePdf, renderHtmlToPdf, loadFileAsDataUrl };
