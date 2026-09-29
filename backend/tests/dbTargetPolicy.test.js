const test = require('node:test');
const assert = require('node:assert/strict');

const {
    isProductionRuntime,
    looksLikeNeonDatabaseEnv,
    assertProductionDatabaseNotNeon,
} = require('../config/dbTargetPolicy');

function withEnv(overrides, fn) {
    const saved = {};
    for (const key of Object.keys(overrides)) {
        saved[key] = process.env[key];
        const val = overrides[key];
        if (val === undefined) delete process.env[key];
        else process.env[key] = val;
    }
    try {
        fn();
    } finally {
        for (const key of Object.keys(saved)) {
            if (saved[key] === undefined) delete process.env[key];
            else process.env[key] = saved[key];
        }
    }
}

test('Neon host is detected in DB env fingerprint', () => {
    withEnv({
        DB_HOST: 'ep-foo-pooler.c-3.eu-central-1.aws.neon.tech',
        DATABASE_URL: undefined,
    }, () => {
        assert.equal(looksLikeNeonDatabaseEnv(), true);
    });
});

test('localhost production target is allowed', () => {
    withEnv({
        NODE_ENV: 'production',
        IS_PRODUCTION: 'true',
        DB_HOST: 'localhost',
        DATABASE_URL: 'postgresql://app@127.0.0.1/melamedlaw',
    }, () => {
        assert.equal(isProductionRuntime(), true);
        assert.equal(looksLikeNeonDatabaseEnv(), false);
        assert.doesNotThrow(() => assertProductionDatabaseNotNeon());
    });
});

test('production + Neon throws before pool connects', () => {
    withEnv({
        NODE_ENV: 'production',
        DB_HOST: 'ep-test.neon.tech',
        DB_NAME: 'neondb',
    }, () => {
        assert.throws(
            () => assertProductionDatabaseNotNeon(),
            /Production must not use Neon/
        );
    });
});

test('development + Neon is allowed (local testing)', () => {
    withEnv({
        NODE_ENV: 'development',
        IS_PRODUCTION: undefined,
        DB_HOST: 'ep-test.neon.tech',
    }, () => {
        assert.equal(isProductionRuntime(), false);
        assert.doesNotThrow(() => assertProductionDatabaseNotNeon());
    });
});
