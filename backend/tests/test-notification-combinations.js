/**
 * Comprehensive Notification QA Test Script
 * Tests all combinations of granular notification settings.
 *
 * Usage: node tests/test-notification-combinations.js
 *
 * Prerequisites:
 *   - Backend running on localhost:5000
 *   - Migration 2026-02-23_00 applied
 *   - Case 72 exists with linked user 1104 and casemanagerid set
 *   - Platform admin user IDs: 1017, 1088
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000';
const CASE_ID = 72;
const ADMIN_PHONE = '0507299064'; // userId 1017 (Admin - Liroy)

// ─── Helpers ─────────────────────────────────────────────────────────

function apiCall(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const postData = body ? JSON.stringify(body) : '';
        const opts = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
            },
        };
        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', d => (data += d));
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });
        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

async function getToken() {
    await apiCall('POST', '/api/Auth/RequestOtp', { phoneNumber: ADMIN_PHONE });
    const res = await apiCall('POST', '/api/Auth/VerifyOtp', {
        phoneNumber: ADMIN_PHONE,
        otp: '123456',
    });
    if (!res.body?.token) {
        console.error('FAIL: Could not get auth token:', res.body);
        process.exit(1);
    }
    return res.body.token;
}

async function setChannelConfig(token, notificationType, settings) {
    const body = {
        pushEnabled: settings.push ?? false,
        emailEnabled: settings.email ?? false,
        smsEnabled: settings.sms ?? false,
        adminCc: settings.adminCc ?? false,
        managerCc: settings.managerCc ?? false,
    };
    const res = await apiCall(
        'PUT',
        `/api/platform-settings/channels/${notificationType}`,
        body,
        token
    );
    if (res.status !== 200) {
        console.error(`FAIL: setChannelConfig ${notificationType}:`, res.status, res.body);
    }
    return res;
}

async function getCase(token, caseId) {
    const res = await apiCall('GET', `/api/Cases/GetCase/${caseId}`, null, token);
    return res.body;
}

async function updateCase(token, caseId, updates) {
    return apiCall('PUT', `/api/Cases/UpdateCase/${caseId}`, updates, token);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// ─── Build update body from API response ─────────────────────────────

function caseToUpdateBody(c) {
    // The API returns PascalCase keys via _mapCaseResults
    return {
        CaseName: c.CaseName,
        CurrentStage: c.CurrentStage,
        IsClosed: c.IsClosed || false,
        IsTagged: c.IsTagged || false,
        CaseTypeId: c.CaseTypeId,
        CaseManagerId: c.CaseManagerId,
        CaseManager: c.CaseManager,
        CompanyName: c.CompanyName || '',
        UserIds: (c.Users || []).map((u) => u.UserId),
        Descriptions: (c.Descriptions || []).map((d) => ({
            DescriptionId: d.DescriptionId,
            Stage: d.Stage,
            Text: d.Text,
            Timestamp: d.Timestamp,
            IsNew: d.IsNew || false,
        })),
        EstimatedCompletionDate: c.EstimatedCompletionDate || null,
        LicenseExpiryDate: c.LicenseExpiryDate || null,
    };
}

// ─── Test Definitions ────────────────────────────────────────────────

const TESTS = [
    // ──── GROUP 1: CASE_NAME_CHANGE ──────────────────────────────────
    {
        name: '1) NAME_CHANGE: All off -> no notifications',
        setup: [
            { type: 'CASE_NAME_CHANGE', push: false, email: false, sms: false, adminCc: false, managerCc: false },
        ],
        change: (b) => {
            b.CaseName = b.CaseName === 'QA Test A' ? 'QA Test B' : 'QA Test A';
        },
        expect: { client: false, manager: false, adminCc: false },
    },
    {
        name: '2) NAME_CHANGE: Push ON -> client gets push, no manager/admin CC',
        setup: [
            { type: 'CASE_NAME_CHANGE', push: true, email: false, sms: false, adminCc: false, managerCc: false },
        ],
        change: (b) => {
            b.CaseName = b.CaseName === 'QA Test A' ? 'QA Test B' : 'QA Test A';
        },
        expect: { client: true, manager: false, adminCc: false },
    },
    {
        name: '3) NAME_CHANGE: Manager CC only -> manager notified, no client push/email/sms',
        setup: [
            { type: 'CASE_NAME_CHANGE', push: false, email: false, sms: false, adminCc: false, managerCc: true },
        ],
        change: (b) => {
            b.CaseName = b.CaseName === 'QA Test A' ? 'QA Test B' : 'QA Test A';
        },
        expect: { client: false, manager: true, adminCc: false },
    },
    {
        name: '4) NAME_CHANGE: Admin CC + push -> client push + admin CC',
        setup: [
            { type: 'CASE_NAME_CHANGE', push: true, email: false, sms: false, adminCc: true, managerCc: false },
        ],
        change: (b) => {
            b.CaseName = b.CaseName === 'QA Test A' ? 'QA Test B' : 'QA Test A';
        },
        expect: { client: true, manager: false, adminCc: true },
    },
    {
        name: '5) NAME_CHANGE: All ON -> client + manager + admin',
        setup: [
            { type: 'CASE_NAME_CHANGE', push: true, email: true, sms: true, adminCc: true, managerCc: true },
        ],
        change: (b) => {
            b.CaseName = b.CaseName === 'QA Test A' ? 'QA Test B' : 'QA Test A';
        },
        expect: { client: true, manager: true, adminCc: true },
    },

    // ──── GROUP 2: CASE_MANAGER_CHANGE ───────────────────────────────
    {
        name: '6) MANAGER_CHANGE: All off -> no notifications',
        setup: [
            { type: 'CASE_MANAGER_CHANGE', push: false, email: false, sms: false, adminCc: false, managerCc: false },
        ],
        change: (b) => {
            if (b.CaseManagerId === 1017) {
                b.CaseManagerId = 1092;
                b.CaseManager = 'מנהל 1092';
            } else {
                b.CaseManagerId = 1017;
                b.CaseManager = 'לירוי';
            }
        },
        expect: { client: false, manager: false, adminCc: false },
    },
    {
        name: '7) MANAGER_CHANGE: Manager CC ON -> new manager notified',
        setup: [
            { type: 'CASE_MANAGER_CHANGE', push: false, email: false, sms: false, adminCc: false, managerCc: true },
        ],
        change: (b) => {
            if (b.CaseManagerId === 1017) {
                b.CaseManagerId = 1092;
                b.CaseManager = 'מנהל 1092';
            } else {
                b.CaseManagerId = 1017;
                b.CaseManager = 'לירוי';
            }
        },
        expect: { client: false, manager: true, adminCc: false },
    },
    {
        name: '8) MANAGER_CHANGE: Admin CC + push -> client push + admin CC',
        setup: [
            { type: 'CASE_MANAGER_CHANGE', push: true, email: false, sms: false, adminCc: true, managerCc: false },
        ],
        change: (b) => {
            if (b.CaseManagerId === 1017) {
                b.CaseManagerId = 1092;
                b.CaseManager = 'מנהל 1092';
            } else {
                b.CaseManagerId = 1017;
                b.CaseManager = 'לירוי';
            }
        },
        expect: { client: true, manager: false, adminCc: true },
    },

    // ──── GROUP 3: CASE_STAGE_CHANGE ─────────────────────────────────
    {
        name: '9) STAGE_CHANGE: Push ON -> client push',
        setup: [
            { type: 'CASE_STAGE_CHANGE', push: true, email: false, sms: false, adminCc: false, managerCc: false },
        ],
        change: (b) => {
            b.CurrentStage = b.CurrentStage === 4 ? 3 : 4;
        },
        expect: { client: true, manager: false, adminCc: false },
    },
    {
        name: '10) STAGE_CHANGE: Manager CC only -> manager notified, no client',
        setup: [
            { type: 'CASE_STAGE_CHANGE', push: false, email: false, sms: false, adminCc: false, managerCc: true },
        ],
        change: (b) => {
            b.CurrentStage = b.CurrentStage === 4 ? 3 : 4;
        },
        expect: { client: false, manager: true, adminCc: false },
    },

    // ──── GROUP 4: Multi-type: TYPE + MANAGER ────────────────────────
    {
        name: '11) TYPE+MANAGER: Manager CC only -> manager notified, no client',
        setup: [
            { type: 'CASE_TYPE_CHANGE', push: false, email: false, sms: false, adminCc: false, managerCc: true },
            { type: 'CASE_MANAGER_CHANGE', push: false, email: false, sms: false, adminCc: false, managerCc: true },
        ],
        change: (b) => {
            b.CaseTypeId = b.CaseTypeId === 16 ? 18 : 16;
            if (b.CaseManagerId === 1017) {
                b.CaseManagerId = 1092;
                b.CaseManager = 'מנהל 1092';
            } else {
                b.CaseManagerId = 1017;
                b.CaseManager = 'לירוי';
            }
        },
        expect: { client: false, manager: true, adminCc: false },
    },

    // ──── GROUP 5: Dedup: Manager IS platform admin ──────────────────
    {
        name: '12) DEDUP: Manager=platformAdmin, admin_cc ON -> manager skipped (already CC)',
        setup: [
            { type: 'CASE_NAME_CHANGE', push: true, email: false, sms: false, adminCc: true, managerCc: true },
        ],
        // First ensure case manager is 1088 (platform admin)
        preSetup: async (token) => {
            const c = await getCase(token, CASE_ID);
            if (c.CaseManagerId !== 1088) {
                const body = caseToUpdateBody(c);
                body.CaseManagerId = 1088;
                body.CaseManager = 'ליאב';
                await updateCase(token, CASE_ID, body);
                await sleep(1000);
            }
        },
        change: (b) => {
            b.CaseName = b.CaseName === 'QA Test A' ? 'QA Test B' : 'QA Test A';
        },
        // Manager IS platform admin AND admin_cc enabled → should be SKIPPED for manager_cc (dedup)
        expect: { client: true, manager: false, adminCc: true, managerSkipReason: 'platform admin with admin_cc' },
    },
    {
        name: '13) DEDUP: Manager=platformAdmin, admin_cc OFF -> manager gets CC',
        setup: [
            { type: 'CASE_NAME_CHANGE', push: true, email: false, sms: false, adminCc: false, managerCc: true },
        ],
        // Ensure case manager is 1088 (platform admin)
        preSetup: async (token) => {
            const c = await getCase(token, CASE_ID);
            if (c.CaseManagerId !== 1088) {
                const body = caseToUpdateBody(c);
                body.CaseManagerId = 1088;
                body.CaseManager = 'ליאב';
                await updateCase(token, CASE_ID, body);
                await sleep(1000);
            }
        },
        change: (b) => {
            b.CaseName = b.CaseName === 'QA Test A' ? 'QA Test B' : 'QA Test A';
        },
        // Manager IS platform admin BUT admin_cc OFF → manager SHOULD get CC via manager_cc
        expect: { client: true, manager: true, adminCc: false },
    },

    // ──── GROUP 6: Individual channel tests (email-only, sms-only) ───
    {
        name: '14) NAME_CHANGE: Email-only -> client gets email, no push/sms',
        setup: [
            { type: 'CASE_NAME_CHANGE', push: false, email: true, sms: false, adminCc: false, managerCc: false },
        ],
        change: (b) => {
            b.CaseName = b.CaseName === 'QA Test A' ? 'QA Test B' : 'QA Test A';
        },
        expect: { client: true, channels: { push: false, email: true, sms: false }, manager: false, adminCc: false },
    },
    {
        name: '15) NAME_CHANGE: SMS-only -> client gets SMS, no push/email',
        setup: [
            { type: 'CASE_NAME_CHANGE', push: false, email: false, sms: true, adminCc: false, managerCc: false },
        ],
        change: (b) => {
            b.CaseName = b.CaseName === 'QA Test A' ? 'QA Test B' : 'QA Test A';
        },
        expect: { client: true, channels: { push: false, email: false, sms: true }, manager: false, adminCc: false },
    },
    {
        name: '16) NAME_CHANGE: All 3 channels ON -> push+email+sms all fire',
        setup: [
            { type: 'CASE_NAME_CHANGE', push: true, email: true, sms: true, adminCc: false, managerCc: false },
        ],
        change: (b) => {
            b.CaseName = b.CaseName === 'QA Test A' ? 'QA Test B' : 'QA Test A';
        },
        expect: { client: true, channels: { push: true, email: true, sms: true }, manager: false, adminCc: false },
    },

    // ──── GROUP 7: Admin CC edge case — no client channels ───────────
    {
        name: '17) EDGE: Admin CC ON but ALL client channels OFF -> admin CC does NOT fire (no client notif = nothing to CC)',
        setup: [
            { type: 'CASE_NAME_CHANGE', push: false, email: false, sms: false, adminCc: true, managerCc: false },
        ],
        change: (b) => {
            b.CaseName = b.CaseName === 'QA Test A' ? 'QA Test B' : 'QA Test A';
        },
        // Admin CC lives inside notifyRecipient which only runs inside the client notification loop.
        // With skipClientNotifications=true, admin CC never fires. This is by design.
        expect: { client: false, manager: false, adminCc: false, note: 'admin_cc=true but no client channels → admin CC does NOT fire (by design)' },
    },
    {
        name: '18) EDGE: Admin CC + Manager CC, no client channels -> only manager CC fires',
        setup: [
            { type: 'CASE_NAME_CHANGE', push: false, email: false, sms: false, adminCc: true, managerCc: true },
        ],
        // Ensure manager is NOT a platform admin for this test (use 1092)
        preSetup: async (token) => {
            const c = await getCase(token, CASE_ID);
            if (c.CaseManagerId !== 1092) {
                const body = caseToUpdateBody(c);
                body.CaseManagerId = 1092;
                body.CaseManager = 'נתנאל רוזנברג';
                await updateCase(token, CASE_ID, body);
                await sleep(1000);
            }
        },
        change: (b) => {
            b.CaseName = b.CaseName === 'QA Test A' ? 'QA Test B' : 'QA Test A';
        },
        // Admin CC won't fire (no client notif → nothing to CC), but manager CC is independent
        expect: { client: false, manager: true, adminCc: false, note: 'admin_cc=true but no client channels → only manager CC fires' },
    },

    // ──── GROUP 8: No changes scenario ──────────────────────────────
    {
        name: '19) NO CHANGES: Same data sent -> no notifications at all',
        setup: [
            { type: 'CASE_NAME_CHANGE', push: true, email: true, sms: true, adminCc: true, managerCc: true },
        ],
        change: (b) => {
            // Don't change anything — send exact same data back
        },
        expect: { client: false, manager: false, adminCc: false, note: 'No fields changed → changedTypes=[] → nothing fires' },
    },

    // ──── GROUP 9: CASE_CLOSED / CASE_REOPENED ───────────────────────
    {
        name: '20) CASE_CLOSED: Push ON -> client notified with CASE_CLOSED type',
        setup: [
            { type: 'CASE_CLOSED', push: true, email: false, sms: false, adminCc: false, managerCc: false },
            // Make sure CASE_STAGE_CHANGE doesn't interfere
            { type: 'CASE_STAGE_CHANGE', push: false, email: false, sms: false, adminCc: false, managerCc: false },
        ],
        // Ensure case is open first
        preSetup: async (token) => {
            const c = await getCase(token, CASE_ID);
            if (c.IsClosed) {
                const body = caseToUpdateBody(c);
                body.IsClosed = false;
                await updateCase(token, CASE_ID, body);
                await sleep(1000);
            }
        },
        change: (b) => {
            b.IsClosed = true;
        },
        expect: { client: true, manager: false, adminCc: false, note: 'changedTypes should include CASE_CLOSED' },
    },
    {
        name: '21) CASE_REOPENED: Manager CC ON -> manager notified on reopen',
        setup: [
            { type: 'CASE_REOPENED', push: false, email: false, sms: false, adminCc: false, managerCc: true },
            { type: 'CASE_STAGE_CHANGE', push: false, email: false, sms: false, adminCc: false, managerCc: false },
        ],
        // Ensure case is closed first
        preSetup: async (token) => {
            const c = await getCase(token, CASE_ID);
            if (!c.IsClosed) {
                const body = caseToUpdateBody(c);
                body.IsClosed = true;
                await updateCase(token, CASE_ID, body);
                await sleep(1000);
            }
        },
        change: (b) => {
            b.IsClosed = false;
        },
        expect: { client: false, manager: true, adminCc: false, note: 'changedTypes should include CASE_REOPENED' },
    },

    // ──── GROUP 10: Mixed multi-type with different configs ──────────
    {
        name: '22) MIXED: NAME has push ON, STAGE has all OFF -> client gets push (NAME triggers it)',
        setup: [
            { type: 'CASE_NAME_CHANGE', push: true, email: false, sms: false, adminCc: false, managerCc: false },
            { type: 'CASE_STAGE_CHANGE', push: false, email: false, sms: false, adminCc: false, managerCc: false },
        ],
        change: (b) => {
            b.CaseName = b.CaseName === 'QA Test A' ? 'QA Test B' : 'QA Test A';
            b.CurrentStage = b.CurrentStage === 4 ? 3 : 4;
        },
        expect: { client: true, manager: false, adminCc: false, note: 'skipClientNotifications=false because NAME_CHANGE has push=true' },
    },
    {
        name: '23) MIXED: NAME has admin CC, STAGE has manager CC -> both admin + manager fire',
        setup: [
            { type: 'CASE_NAME_CHANGE', push: true, email: false, sms: false, adminCc: true, managerCc: false },
            { type: 'CASE_STAGE_CHANGE', push: false, email: false, sms: false, adminCc: false, managerCc: true },
        ],
        // Ensure manager is NOT platform admin
        preSetup: async (token) => {
            const c = await getCase(token, CASE_ID);
            if (c.CaseManagerId !== 1092) {
                const body = caseToUpdateBody(c);
                body.CaseManagerId = 1092;
                body.CaseManager = 'נתנאל רוזנברג';
                await updateCase(token, CASE_ID, body);
                await sleep(1000);
            }
        },
        change: (b) => {
            b.CaseName = b.CaseName === 'QA Test A' ? 'QA Test B' : 'QA Test A';
            b.CurrentStage = b.CurrentStage === 4 ? 3 : 4;
        },
        // Admin CC fires because client notif runs (NAME has push=true) and admin_cc=true on NAME
        // Manager CC fires because STAGE has manager_cc=true
        expect: { client: true, manager: true, adminCc: true, note: 'NAME triggers admin CC via client notif, STAGE triggers manager CC independently' },
    },

    // ──── GROUP 11: Admin CC with email channel ──────────────────────
    {
        name: '24) Admin CC via email channel -> admin gets email CC copy',
        setup: [
            { type: 'CASE_NAME_CHANGE', push: false, email: true, sms: false, adminCc: true, managerCc: false },
        ],
        change: (b) => {
            b.CaseName = b.CaseName === 'QA Test A' ? 'QA Test B' : 'QA Test A';
        },
        expect: { client: true, channels: { push: false, email: true, sms: false }, manager: false, adminCc: true },
    },
];

// ─── Runner ──────────────────────────────────────────────────────────

async function run() {
    console.log('AUTH: Getting token...');
    const token = await getToken();
    console.log('AUTH: OK\n');

    let passed = 0;
    let failed = 0;

    for (let i = 0; i < TESTS.length; i++) {
        const test = TESTS[i];
        console.log(`\n${'='.repeat(70)}`);
        console.log(`TEST ${test.name}`);
        console.log('='.repeat(70));

        // 0. Pre-setup (e.g. ensure manager is a specific user)
        if (test.preSetup) {
            console.log('  [pre-setup] Running...');
            await test.preSetup(token);
            console.log('  [pre-setup] Done');
        }

        // 1. Set up channel config(s)
        for (const s of test.setup) {
            const r = await setChannelConfig(token, s.type, s);
            console.log(
                `  [config] ${s.type}: push=${s.push} email=${s.email} sms=${s.sms} adminCc=${s.adminCc} managerCc=${s.managerCc} => ${r.status}`
            );
        }

        // 2. Get current case state
        const caseData = await getCase(token, CASE_ID);
        if (!caseData?.CaseId) {
            console.error('  FAIL: Could not get case', CASE_ID);
            failed++;
            continue;
        }

        // 3. Build update body + apply mutation
        const body = caseToUpdateBody(caseData);
        const beforeSnapshot = JSON.stringify(body);
        test.change(body);
        const changedKeys = Object.keys(body).filter(
            (k) => JSON.stringify(body[k]) !== JSON.stringify(JSON.parse(beforeSnapshot)[k])
        );

        console.log(`  [update] Changed keys: ${changedKeys.join(', ')}`);

        // 4. Send update
        const result = await updateCase(token, CASE_ID, body);
        if (result.status !== 200) {
            console.error(`  FAIL: Update returned ${result.status}`, result.body);
            failed++;
            continue;
        }

        // 5. Brief wait for async notification processing
        await sleep(1500);

        console.log(`  [result] Update OK`);
        console.log(`  [expect] client=${test.expect.client} | manager=${test.expect.manager} | adminCc=${test.expect.adminCc}${test.expect.managerSkipReason ? ' | managerSkipReason=' + test.expect.managerSkipReason : ''}${test.expect.channels ? ' | channels=' + JSON.stringify(test.expect.channels) : ''}${test.expect.note ? ' | NOTE: ' + test.expect.note : ''}`);
        console.log(`  >>> CHECK SERVER CONSOLE FOR [QA DEBUG] OUTPUT <<<`);
        passed++;
    }

    // Reset configs to safe defaults
    console.log('\n[cleanup] Resetting notification configs...');
    const allTypes = [
        'CASE_CREATED', 'CASE_NAME_CHANGE', 'CASE_TYPE_CHANGE', 'CASE_STAGE_CHANGE',
        'CASE_CLOSED', 'CASE_REOPENED', 'CASE_MANAGER_CHANGE', 'CASE_EST_DATE_CHANGE',
        'CASE_LICENSE_CHANGE', 'CASE_COMPANY_CHANGE', 'CASE_TAGGED',
    ];
    for (const t of allTypes) {
        await setChannelConfig(token, t, { push: false, email: false, sms: false, adminCc: false, managerCc: true });
    }

    // Restore case to a clean state (open, manager=1088)
    const finalCase = await getCase(token, CASE_ID);
    if (finalCase?.CaseId) {
        const restoreBody = caseToUpdateBody(finalCase);
        restoreBody.IsClosed = false;
        restoreBody.CaseManagerId = 1088;
        restoreBody.CaseManager = 'ליאב מלמד';
        await updateCase(token, CASE_ID, restoreBody);
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`DONE: ${passed} tests executed, ${failed} failed`);
    console.log(`Verify results by checking the server [QA DEBUG] console output.`);
    console.log('='.repeat(70));
}

run().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
