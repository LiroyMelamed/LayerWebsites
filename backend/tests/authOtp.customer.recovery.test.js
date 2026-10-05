process.env.NODE_ENV = 'test';

const otpLifecycleEnvSnapshot = {
    DEMO_OTP_PHONES: process.env.DEMO_OTP_PHONES,
    JWT_SECRET: process.env.JWT_SECRET,
    SIGNING_OTP_PEPPER: process.env.SIGNING_OTP_PEPPER,
};
// Prevent developer backend/.env from affecting deterministic OTP lifecycle assertions.
process.env.DEMO_OTP_PHONES = '';
process.env.JWT_SECRET = 'test-secret-otp-lifecycle';
process.env.SIGNING_OTP_PEPPER = '';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const OTP_PEPPER = String(process.env.SIGNING_OTP_PEPPER || '');
function hashOtpPlain(otp) {
    return crypto.createHmac('sha256', OTP_PEPPER).update(String(otp)).digest('hex');
}

const otpsByPhone = new Map();
let otpSeq = 0;
let sendCalls = [];
let sendImpl = async () => ({ ok: true });

const pool = require('../config/db');
pool.query = async (sql, params = []) => {
    const q = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();

    if (q.includes('select userid from users where phonenumber')) {
        return { rows: [{ userid: 99 }] };
    }
    if (q.startsWith('delete from otps where phonenumber')) {
        otpsByPhone.delete(params[0]);
        return { rowCount: 1, rows: [] };
    }
    if (q.startsWith('delete from otps where id')) {
        for (const [phone, row] of otpsByPhone.entries()) {
            if (row.id === params[0]) otpsByPhone.delete(phone);
        }
        return { rowCount: 1, rows: [] };
    }
    if (q.includes('insert into otps') && q.includes('returning id')) {
        const [phone, otpHash, expiry, userid] = params;
        const id = ++otpSeq;
        otpsByPhone.set(phone, { id, otp: otpHash, expiry, userid });
        return { rows: [{ id }], rowCount: 1 };
    }
    if (q.includes('from otps o') && q.includes('join users')) {
        const [phone, otpHash] = params;
        const row = otpsByPhone.get(phone);
        if (!row || row.otp !== otpHash) return { rows: [] };
        return { rows: [{ userid: 99, role: 'User', phonenumber: phone, email: null }] };
    }
    if (q.startsWith('delete from otps where phonenumber') && q.includes('and otp')) {
        return { rowCount: 1, rows: [] };
    }

    throw new Error(`Unexpected pool.query in OTP lifecycle test: ${sql}`);
};

pool.connect = async () => ({
    query: async (sql) => {
        if (String(sql).includes('refresh_tokens')) {
            const err = new Error('undefined_table');
            err.code = '42P01';
            throw err;
        }
        return { rows: [] };
    },
    release() {},
});

const sendMessageModule = require('../utils/sendMessage');
sendMessageModule.sendMessage = async (...args) => {
    sendCalls.push(args);
    return sendImpl(...args);
};

const { requestOtp, verifyOtp } = require('../controllers/authController');

function mockReq(body = {}) {
    return { body, headers: { 'x-client-platform': 'web' }, tenant: null };
}

function mockRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
}

function resetOtpState() {
    otpsByPhone.clear();
    otpSeq = 0;
    sendCalls = [];
    sendImpl = async () => ({ ok: true });
}

test('OTP lifecycle: provider success returns otpSent and verify works', async () => {
    resetOtpState();
    const phone = '0501234567';
    const res = mockRes();
    await requestOtp(mockReq({ phoneNumber: phone }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.otpSent, true);
    assert.equal(sendCalls.length, 1);
    assert.equal(otpsByPhone.size, 1);

    const code = '123456';
    otpsByPhone.get(phone).otp = hashOtpPlain(code);

    const verifyRes = mockRes();
    await verifyOtp(mockReq({ phoneNumber: phone, otp: code }), verifyRes);
    assert.equal(verifyRes.statusCode, 200);
    assert.ok(verifyRes.body?.token);
});

test('OTP lifecycle: provider { ok:false } returns 503 and removes challenge', async () => {
    resetOtpState();
    sendImpl = async () => ({ ok: false, error: 'provider_rejected' });
    const res = mockRes();
    await requestOtp(mockReq({ phoneNumber: '0502222222' }), res);

    assert.equal(res.statusCode, 503);
    assert.notEqual(res.body?.otpSent, true);
    assert.equal(otpsByPhone.size, 0);
});

test('OTP lifecycle: provider throw returns 503 and removes challenge', async () => {
    resetOtpState();
    sendImpl = async () => {
        throw new Error('inforu down');
    };
    const res = mockRes();
    await requestOtp(mockReq({ phoneNumber: '0503333333' }), res);

    assert.equal(res.statusCode, 503);
    assert.equal(otpsByPhone.size, 0);
});

test('OTP lifecycle: failed send then immediate retry succeeds', async () => {
    resetOtpState();
    let attempt = 0;
    sendImpl = async () => {
        attempt += 1;
        if (attempt === 1) return { ok: false, error: 'provider_rejected' };
        return { ok: true };
    };

    const failRes = mockRes();
    await requestOtp(mockReq({ phoneNumber: '0504444444' }), failRes);
    assert.equal(failRes.statusCode, 503);
    assert.equal(otpsByPhone.size, 0);

    const okRes = mockRes();
    await requestOtp(mockReq({ phoneNumber: '0504444444' }), okRes);
    assert.equal(okRes.statusCode, 200);
    assert.equal(okRes.body.otpSent, true);
    assert.equal(sendCalls.length, 2);
    assert.equal(otpsByPhone.size, 1);
});

test('OTP lifecycle: sequential second request replaces challenge (rate limit is separate)', async () => {
    resetOtpState();
    const phone = '0505555555';
    const first = mockRes();
    await requestOtp(mockReq({ phoneNumber: phone }), first);
    const firstId = otpsByPhone.get(phone)?.id;

    const second = mockRes();
    await requestOtp(mockReq({ phoneNumber: phone }), second);
    const secondId = otpsByPhone.get(phone)?.id;

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.equal(sendCalls.length, 2);
    assert.notEqual(firstId, secondId);
});

test('OTP lifecycle: concurrent failure rollback does not delete newer challenge', async () => {
    resetOtpState();
    const phone = '0506666666';
    let releaseFirst;
    const firstHeld = new Promise((resolve) => {
        releaseFirst = resolve;
    });

    sendImpl = async () => {
        if (sendCalls.length === 1) {
            await firstHeld;
            return { ok: false, error: 'provider_rejected' };
        }
        return { ok: true };
    };

    const slowRes = mockRes();
    const slowPromise = requestOtp(mockReq({ phoneNumber: phone }), slowRes);

    await new Promise((r) => setTimeout(r, 5));

    const fastRes = mockRes();
    await requestOtp(mockReq({ phoneNumber: phone }), fastRes);
    assert.equal(fastRes.statusCode, 200);
    assert.equal(fastRes.body.otpSent, true);
    const survivingId = otpsByPhone.get(phone)?.id;
    assert.ok(survivingId);

    releaseFirst();
    await slowPromise;
    assert.equal(slowRes.statusCode, 503);
    assert.equal(otpsByPhone.get(phone)?.id, survivingId);
});

test.after(() => {
    if (otpLifecycleEnvSnapshot.DEMO_OTP_PHONES === undefined) {
        delete process.env.DEMO_OTP_PHONES;
    } else {
        process.env.DEMO_OTP_PHONES = otpLifecycleEnvSnapshot.DEMO_OTP_PHONES;
    }
    if (otpLifecycleEnvSnapshot.JWT_SECRET === undefined) {
        delete process.env.JWT_SECRET;
    } else {
        process.env.JWT_SECRET = otpLifecycleEnvSnapshot.JWT_SECRET;
    }
    if (otpLifecycleEnvSnapshot.SIGNING_OTP_PEPPER === undefined) {
        delete process.env.SIGNING_OTP_PEPPER;
    } else {
        process.env.SIGNING_OTP_PEPPER = otpLifecycleEnvSnapshot.SIGNING_OTP_PEPPER;
    }
});
