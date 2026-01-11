const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

function mockPublicSigningFlow(page, { token = 'test-token', requireOtp }) {
  const apiBase = '**/api/SigningFiles/public/' + token;

  // Signing details
  page.route(apiBase, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        file: {
          SigningFileId: 123,
          ClientId: 456,
          RequireOtp: Boolean(requireOtp),
          FileKey: null,
          SigningPolicyVersion: '2026-01-11',
        },
        signatureSpots: [
          {
            SignatureSpotId: 1,
            SigningFileId: 123,
            PageNumber: 1,
            X: 50,
            Y: 50,
            Width: 150,
            Height: 75,
            SignerName: 'אתה',
            IsRequired: true,
            IsSigned: false,
          },
        ],
        isLawyer: false,
      }),
    });
  });

  // Saved signature endpoints (no saved signature to keep UI in draw mode)
  page.route('**/api/SigningFiles/public/' + token + '/saved-signature', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ exists: false, url: null }),
    });
  });

  page.route('**/api/SigningFiles/public/' + token + '/saved-signature/data-url', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: false, errorCode: 'NOT_FOUND', message: 'אין חתימה שמורה' }),
    });
  });

  page.route('**/api/SigningFiles/public/' + token + '/saved-signature', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ success: true }),
      });
      return;
    }
    await route.fallback();
  });

  // PDF fetch (SignatureCanvas uses fetch for this); respond 404 so the UI falls back to the placeholder.
  page.route('**/api/SigningFiles/public/' + token + '/pdf', async (route) => {
    await route.fulfill({ status: 404, body: '' });
  });

  // OTP endpoints
  page.route('**/api/SigningFiles/public/' + token + '/otp/request', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true }),
    });
  });

  page.route('**/api/SigningFiles/public/' + token + '/otp/verify', async (route) => {
    const payload = route.request().postDataJSON?.() || {};
    const otp = String(payload.otp || '');

    if (/^[0-9]{6}$/.test(otp)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    await route.fulfill({
      status: 422,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: false, errorCode: 'INVALID_OTP', message: 'קוד אימות לא תקין' }),
    });
  });

  // Sign endpoint (we only need to observe whether it gets called)
  page.route('**/api/SigningFiles/public/' + token + '/sign', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true }),
    });
  });
}

async function drawOnCanvas(page) {
  const canvas = page.locator('canvas.lw-signing-canvas');
  await expect(canvas).toBeVisible();

  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas has no bounding box');

  const x0 = box.x + box.width * 0.2;
  const y0 = box.y + box.height * 0.5;
  const x1 = box.x + box.width * 0.8;
  const y1 = box.y + box.height * 0.5;

  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 10 });
  await page.mouse.up();
}

function mockLawyerSigningManager(page, { signingFileId = 123, requireOtp }) {
  // List
  page.route('**/api/SigningFiles/lawyer-files**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        files: [
          {
            SigningFileId: signingFileId,
            CaseId: 999,
            FileName: 'מסמך-חתום.pdf',
            Status: 'signed',
            CreatedAt: new Date().toISOString(),
            SignedAt: new Date().toISOString(),
            CaseName: 'תיק בדיקה',
            ClientName: 'לקוח בדיקה',
            TotalSpots: 1,
            SignedSpots: 1,

            // Must be present for the Evidence Package button
            SignedFileKey: 'signed/key.pdf',

            RequireOtp: Boolean(requireOtp),
            SigningPolicyVersion: '2026-01-11',
            PolicySelectedByUserId: 777,
            PolicySelectedAtUtc: new Date().toISOString(),
          },
        ],
      }),
    });
  });

  // Evidence package ZIP
  page.route(`**/api/SigningFiles/${signingFileId}/evidence-package`, async (route) => {
    const bytes = Buffer.from('evidence-zip-bytes-not-a-real-zip-but-non-empty');
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/zip',
        'content-disposition': 'attachment; filename="evidence_999_123_20260112_1200.zip"',
      },
      body: bytes,
    });
  });

  // PDF open in details (optional)
  page.route('**/api/SigningFiles/**/pdf', async (route) => {
    await route.fulfill({ status: 404, body: '' });
  });

  // Signed file download link endpoint used by "הורד קובץ חתום" (not required here)
  page.route('**/api/SigningFiles/**/download', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ downloadUrl: 'http://example.invalid/signed.pdf', expiresIn: 600 }),
    });
  });
}

async function downloadEvidencePackageFromManager(page) {
  await page.goto('/AdminStack/SigningManagerScreen');

  // SigningManagerScreen defaults to the pending tab; switch to signed.
  await page.getByRole('button', { name: /חתומים/ }).click();

  // Open details popup
  await page.getByRole('button', { name: 'פרטי מסמך' }).first().click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'הורד חבילת ראיות' }).click(),
  ]);

  await expect(download.suggestedFilename()).toMatch(/^evidence_.*\.zip$/);

  const outPath = path.join(os.tmpdir(), `pw-evidence-${Date.now()}-${Math.random().toString(16).slice(2)}.zip`);
  await download.saveAs(outPath);
  const stat = await fs.stat(outPath);
  expect(stat.size).toBeGreaterThan(0);
}

test('OTP required: blocks signing until consent + OTP verified', async ({ page }) => {
  const token = 'otp-required-token';
  mockPublicSigningFlow(page, { token, requireOtp: true });

  // Prepare a logged-in lawyer session for the manager screen.
  await page.addInitScript(() => {
    localStorage.setItem('token', 'test-token');
  });
  mockLawyerSigningManager(page, { signingFileId: 123, requireOtp: true });

  let signCalls = 0;
  page.on('request', (req) => {
    if (req.url().includes(`/api/SigningFiles/public/${token}/sign`)) signCalls += 1;
  });

  await page.goto(`/public-sign?token=${encodeURIComponent(token)}`);

  // Open signing flow (first spot)
  await page.getByRole('button', { name: 'לחתימה הבאה' }).click();

  await drawOnCanvas(page);

  // 1) No consent -> warning
  await page.getByRole('button', { name: 'שמור חתימה' }).click();
  await expect(page.locator('.lw-signing-message.is-warning')).toContainText('יש לאשר הסכמה לחתימה');

  // 2) With consent but no OTP -> warning
  await page.locator('.lw-signing-legalRow input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'שמור חתימה' }).click();
  await expect(page.locator('.lw-signing-message.is-warning')).toContainText('נדרש אימות SMS');

  // 3) Request + verify OTP
  await page.getByRole('button', { name: 'שלח קוד' }).click();
  await expect(page.locator('.lw-signing-message.is-success')).toContainText('קוד אימות נשלח');

  await page.getByPlaceholder('קוד (6 ספרות)').fill('123456');
  await page.getByRole('button', { name: 'אמת' }).click();
  await expect(page.locator('.lw-signing-message.is-success')).toContainText('הקוד אומת בהצלחה');

  // Complete signing (make sure sign endpoint is called)
  await page.getByRole('button', { name: 'שמור חתימה' }).click();
  await expect.poll(() => signCalls).toBeGreaterThan(0);

  // Download evidence package from lawyer UI
  await downloadEvidencePackageFromManager(page);
});

test('OTP waived: no OTP UI and sign call proceeds with consent', async ({ page }) => {
  const token = 'otp-waived-token';
  mockPublicSigningFlow(page, { token, requireOtp: false });

  // Prepare a logged-in lawyer session for the manager screen.
  await page.addInitScript(() => {
    localStorage.setItem('token', 'test-token');
  });
  mockLawyerSigningManager(page, { signingFileId: 123, requireOtp: false });

  let signCalls = 0;
  page.on('request', (req) => {
    if (req.url().includes(`/api/SigningFiles/public/${token}/sign`)) signCalls += 1;
  });

  await page.goto(`/public-sign?token=${encodeURIComponent(token)}`);

  await page.getByRole('button', { name: 'לחתימה הבאה' }).click();

  // OTP UI should not exist
  await expect(page.getByText('נדרש אימות SMS (OTP) לפני חתימה')).toHaveCount(0);

  // Consent + drawn signature should allow save (and call sign endpoint)
  await page.locator('.lw-signing-legalRow input[type="checkbox"]').check();
  await drawOnCanvas(page);
  await page.getByRole('button', { name: 'שמור חתימה' }).click();

  await expect.poll(() => signCalls).toBeGreaterThan(0);

  // Download evidence package from lawyer UI
  await downloadEvidencePackageFromManager(page);
});
