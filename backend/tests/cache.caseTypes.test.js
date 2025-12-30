const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getCaseTypesListCached,
    getCaseTypeByIdCached,
    invalidateCaseTypes,
    __testReset,
} = require('../utils/caseTypesCache');

test('caseTypes list cache is scoped per user for non-admin', async () => {
    __testReset();

    let calls = 0;
    const loader = async () => {
        calls += 1;
        return { rows: [{ casetypeid: calls }] };
    };

    const a1 = await getCaseTypesListCached({ role: 'User', userId: 1, loader });
    const a2 = await getCaseTypesListCached({ role: 'User', userId: 1, loader });
    const b1 = await getCaseTypesListCached({ role: 'User', userId: 2, loader });

    assert.equal(calls, 2);
    assert.deepEqual(a1, a2);
    assert.notDeepEqual(a1, b1);
});

test('caseTypes list cache is shared for admin', async () => {
    __testReset();

    let calls = 0;
    const loader = async () => {
        calls += 1;
        return { rows: [{ casetypeid: 123 }] };
    };

    await getCaseTypesListCached({ role: 'Admin', userId: 1, loader });
    await getCaseTypesListCached({ role: 'Admin', userId: 999, loader });

    assert.equal(calls, 1);
});

test('caseTypes list does not cache when userId missing for non-admin', async () => {
    __testReset();

    let calls = 0;
    const loader = async () => {
        calls += 1;
        return { rows: [{ casetypeid: calls }] };
    };

    await getCaseTypesListCached({ role: 'User', userId: undefined, loader });
    await getCaseTypesListCached({ role: 'User', userId: undefined, loader });

    assert.equal(calls, 2);
});

test('caseTypes cache respects TTL', async () => {
    __testReset();

    let calls = 0;
    const loader = async () => {
        calls += 1;
        return { rows: [{ casetypeid: calls }] };
    };

    const ttlMs = 25;

    const v1 = await getCaseTypesListCached({ role: 'Admin', userId: 1, loader, ttlMs });
    const v2 = await getCaseTypesListCached({ role: 'Admin', userId: 1, loader, ttlMs });

    assert.equal(calls, 1);
    assert.deepEqual(v1, v2);

    await new Promise((r) => setTimeout(r, ttlMs + 10));

    const v3 = await getCaseTypesListCached({ role: 'Admin', userId: 1, loader, ttlMs });
    assert.equal(calls, 2);
    assert.notDeepEqual(v1, v3);
});

test('caseTypes invalidation clears list + id caches', async () => {
    __testReset();

    let listCalls = 0;
    let idCalls = 0;

    const listLoader = async () => {
        listCalls += 1;
        return { rows: [{ casetypeid: listCalls }] };
    };

    const idLoader = async () => {
        idCalls += 1;
        return { rows: [{ casetypeid: 5, version: idCalls }] };
    };

    await getCaseTypesListCached({ role: 'Admin', userId: 1, loader: listLoader, ttlMs: 10_000 });
    await getCaseTypeByIdCached({ caseTypeId: 5, loader: idLoader, ttlMs: 10_000 });

    assert.equal(listCalls, 1);
    assert.equal(idCalls, 1);

    invalidateCaseTypes({ caseTypeId: 5 });

    await getCaseTypesListCached({ role: 'Admin', userId: 1, loader: listLoader, ttlMs: 10_000 });
    await getCaseTypeByIdCached({ caseTypeId: 5, loader: idLoader, ttlMs: 10_000 });

    assert.equal(listCalls, 2);
    assert.equal(idCalls, 2);
});
