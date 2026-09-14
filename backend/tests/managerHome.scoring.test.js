const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildAttentionItems,
    deriveCaseHealth,
    buildMorningBrief,
    sortAttentionItems,
    groupAttentionItems,
    flattenAttentionItems,
    signalMeta,
    PRIORITY_RANK,
    TIER_RANK,
} = require('../services/managerHome/scoring');
const C = require('../services/managerHome/constants');

const NOW = new Date('2026-09-06T10:00:00Z');

function baseCase(overrides = {}) {
    return {
        caseid: 1,
        casename: 'Test Case',
        casemanagerid: 10,
        casemanager: 'Danny Cohen',
        haslicenseexpiry: false,
        licenseexpirydate: null,
        estimatedcompletiondate: null,
        days_since_meaningful_activity: 0,
        days_in_current_stage: 5,
        currentstage: 2,
        client_name: 'Client A',
        ...overrides,
    };
}

function baseSigning(overrides = {}) {
    return {
        signingfileid: 5,
        caseid: 2,
        casename: 'Sign Case',
        filename: 'contract.pdf',
        status: 'pending',
        createdat: new Date('2026-09-01T12:00:00Z'),
        expiresat: null,
        casemanagerid: 3,
        casemanager: 'Manager',
        client_name: 'Client',
        ...overrides,
    };
}

// --- Case health ---

test('deriveCaseHealth returns at_risk when critical signals exist', () => {
    assert.equal(deriveCaseHealth(1, true), 'at_risk');
    assert.equal(deriveCaseHealth(2, false), 'at_risk');
});

test('deriveCaseHealth returns needs_attention for single signal', () => {
    assert.equal(deriveCaseHealth(1, false), 'needs_attention');
});

test('deriveCaseHealth returns healthy when no signals', () => {
    assert.equal(deriveCaseHealth(0, false), 'healthy');
});

// --- Hard vs soft priority ---

test('hard signals outrank soft signals regardless of due date', () => {
    const sorted = sortAttentionItems([
        { signalType: 'no_activity', signalTier: 'soft', priority: 'low', dueAt: null },
        { signalType: 'signing_expired', signalTier: 'hard', priority: 'critical', dueAt: '2026-09-10T00:00:00Z' },
        { signalType: 'long_in_stage', signalTier: 'soft', priority: 'low', dueAt: null },
    ]);
    assert.equal(sorted[0].signalType, 'signing_expired');
});

test('signalMeta assigns hard tier to license and signing expiry', () => {
    assert.equal(signalMeta('license_expired').tier, 'hard');
    assert.equal(signalMeta('signing_expired').priority, 'critical');
    assert.equal(signalMeta('no_activity').tier, 'soft');
});

test('soft signals cannot outrank hard signals after grouping', () => {
    const items = buildAttentionItems({
        caseRows: [
            baseCase({ caseid: 1, days_since_meaningful_activity: 14 }),
            baseCase({ caseid: 2, days_since_meaningful_activity: 10 }),
            baseCase({ caseid: 3, days_since_meaningful_activity: 9 }),
        ],
        signingRows: [
            baseSigning({
                signingfileid: 1,
                expiresat: new Date('2026-09-01T12:00:00Z'),
            }),
        ],
        now: NOW,
    });
    assert.equal(items[0].signalType, 'signing_expired');
    assert.equal(items[0].signalTier, 'hard');
});

// --- License expiration windows ---

test('buildAttentionItems surfaces license critical and warning windows', () => {
    const items = buildAttentionItems({
        caseRows: [
            baseCase({
                caseid: 1,
                haslicenseexpiry: true,
                licenseexpirydate: '2026-09-10',
            }),
            baseCase({
                caseid: 2,
                haslicenseexpiry: true,
                licenseexpirydate: '2026-10-01',
            }),
            baseCase({
                caseid: 3,
                haslicenseexpiry: true,
                licenseexpirydate: '2026-08-01',
            }),
        ],
        now: NOW,
    });
    const types = items.map((i) => i.signalType);
    assert.ok(types.includes('license_expiring_critical'));
    assert.ok(types.includes('license_expiring_warning'));
    assert.ok(types.includes('license_expired'));
});

// --- Unassigned + meaningful activity ---

test('buildAttentionItems surfaces unassigned case and meaningful inactivity', () => {
    const items = buildAttentionItems({
        caseRows: [
            baseCase({
                casemanagerid: null,
                casemanager: null,
                days_since_meaningful_activity: 91,
            }),
        ],
        now: NOW,
    });
    const types = items.map((i) => i.kind === 'group' ? i.signalType : i.signalType);
    assert.ok(types.includes('unassigned_case'));
    assert.ok(types.includes('no_activity'));
});

test('no_activity uses days_since_meaningful_activity not updatedat', () => {
    const items = buildAttentionItems({
        caseRows: [baseCase({ days_since_meaningful_activity: 91 })],
        now: NOW,
    });
    const noAct = items.find((i) => i.signalType === 'no_activity');
    assert.ok(noAct);
    assert.equal(noAct.reasonParams.days, 91);
});

// --- Signing priority ---

test('expired signing is critical hard signal', () => {
    const items = buildAttentionItems({
        signingRows: [
            baseSigning({
                expiresat: new Date('2026-09-01T12:00:00Z'),
            }),
        ],
        now: NOW,
    });
    const expired = items.find((i) => i.signalType === 'signing_expired');
    assert.ok(expired);
    assert.equal(expired.priority, 'critical');
    assert.equal(expired.signalTier, 'hard');
});

test('expiring signing outranks pending age signal (no duplicate)', () => {
    const items = buildAttentionItems({
        signingRows: [
            baseSigning({
                createdat: new Date('2026-08-01T12:00:00Z'),
                expiresat: new Date('2026-09-08T12:00:00Z'),
            }),
        ],
        now: NOW,
    });
    const types = flattenAttentionItems(items).map((i) => i.signalType);
    assert.ok(types.includes('signing_expiring'));
    assert.ok(!types.includes('signing_pending'));
});

test('rejected signing is hard high priority', () => {
    const items = buildAttentionItems({
        signingRows: [baseSigning({ status: 'rejected' })],
        now: NOW,
    });
    const rejected = items.find((i) => i.signalType === 'signing_rejected');
    assert.ok(rejected);
    assert.equal(rejected.signalTier, 'hard');
    assert.equal(rejected.priority, 'high');
});

test('pending signing appears when not expired or expiring', () => {
    const items = buildAttentionItems({
        signingRows: [
            baseSigning({
                createdat: new Date('2026-08-28T12:00:00Z'),
                expiresat: new Date('2026-09-20T12:00:00Z'),
            }),
        ],
        now: NOW,
    });
    assert.ok(items.some((i) => i.signalType === 'signing_pending'));
});

// --- Stage stagnation ---

test('long_in_stage is soft signal with low priority', () => {
    const items = buildAttentionItems({
        caseRows: [baseCase({ days_in_current_stage: 45, currentstage: 3 })],
        now: NOW,
    });
    const stage = items.find((i) => i.signalType === 'long_in_stage');
    assert.ok(stage);
    assert.equal(stage.signalTier, 'soft');
    assert.equal(stage.priority, 'low');
});

// --- Estimated completion ---

test('estimated completion approaching and passed are soft signals', () => {
    const items = buildAttentionItems({
        caseRows: [
            baseCase({ caseid: 1, estimatedcompletiondate: '2026-09-01' }),
            baseCase({ caseid: 2, estimatedcompletiondate: '2026-09-10' }),
        ],
        now: NOW,
    });
    const passed = items.find((i) => i.signalType === 'completion_passed');
    const approaching = items.find((i) => i.signalType === 'completion_approaching');
    assert.ok(passed);
    assert.ok(approaching);
    assert.equal(passed.signalTier, 'soft');
});

// --- Grouping ---

test('groupAttentionItems collapses completion_passed signals', () => {
    const singles = [
        { signalType: 'completion_passed', signalTier: 'soft', priority: 'medium', kind: 'single', caseId: 1 },
        { signalType: 'completion_passed', signalTier: 'soft', priority: 'medium', kind: 'single', caseId: 2 },
    ];
    const grouped = groupAttentionItems(singles);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].kind, 'group');
    assert.equal(grouped[0].count, 2);
});

test('groupAttentionItems collapses multiple soft signals of same type', () => {
    const singles = [
        { signalType: 'no_activity', signalTier: 'soft', priority: 'low', kind: 'single', caseId: 1 },
        { signalType: 'no_activity', signalTier: 'soft', priority: 'low', kind: 'single', caseId: 2 },
        { signalType: 'no_activity', signalTier: 'soft', priority: 'low', kind: 'single', caseId: 3 },
    ];
    const grouped = groupAttentionItems(singles);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].kind, 'group');
    assert.equal(grouped[0].count, 3);
});

test('hard signals are never grouped', () => {
    const items = buildAttentionItems({
        caseRows: [
            baseCase({ caseid: 1, casemanagerid: null }),
            baseCase({ caseid: 2, casemanagerid: null }),
        ],
        now: NOW,
    });
    const unassigned = items.filter((i) => i.signalType === 'unassigned_case');
    assert.equal(unassigned.length, 2);
    assert.ok(unassigned.every((i) => i.kind === 'single'));
});

test('attention display respects limit after grouping', () => {
    const caseRows = Array.from({ length: 20 }, (_, i) =>
        baseCase({ caseid: i + 1, days_since_meaningful_activity: 10 + i })
    );
    const items = buildAttentionItems({ caseRows, now: NOW });
    assert.ok(items.length <= C.ATTENTION_DISPLAY_LIMIT);
});

// --- Morning brief ---

test('buildMorningBrief all clear when no signals', () => {
    const brief = buildMorningBrief({
        attentionItems: [],
        today: [],
        potentialClients: [],
    });
    assert.equal(brief.key, 'managerHome.brief.allClear');
});

test('buildMorningBrief calm with today when no attention but events exist', () => {
    const brief = buildMorningBrief({
        attentionItems: [],
        today: [{ id: 1 }, { id: 2 }],
        potentialClients: [],
    });
    assert.equal(brief.key, 'managerHome.brief.calmWithToday');
    assert.equal(brief.params.todayCount, 2);
});

test('buildMorningBrief prioritizes top hard signals over summary counts', () => {
    const attentionItems = buildAttentionItems({
        caseRows: [baseCase({ casemanagerid: null })],
        signingRows: [
            baseSigning({
                expiresat: new Date('2026-09-01T12:00:00Z'),
            }),
        ],
        now: NOW,
    });
    const brief = buildMorningBrief({
        attentionItems,
        today: [{ id: 1, isPotentialClient: true }],
        potentialClients: [{ id: 1 }],
    });
    assert.ok(Array.isArray(brief.sentences));
    assert.ok(brief.sentences.length >= 1);
    assert.ok(brief.sentences.some((s) => s.key.includes('signing_expired') || s.key.includes('unassigned')));
    assert.ok(brief.todayNote);
});

test('buildMorningBrief does not repeat raw summary numbers', () => {
    const brief = buildMorningBrief({
        attentionItems: buildAttentionItems({
            caseRows: [baseCase({ days_since_meaningful_activity: 12 })],
            now: NOW,
        }),
        today: [],
        potentialClients: [],
    });
    assert.ok(!brief.parts);
    assert.ok(brief.sentences || brief.key);
});

// --- Empty dashboard ---

test('empty dashboard produces no attention items and all-clear brief', () => {
    const items = buildAttentionItems({
        caseRows: [baseCase({ days_since_meaningful_activity: 2, days_in_current_stage: 5 })],
        signingRows: [],
        rsvpRows: [],
        failedReminders: [],
        now: NOW,
    });
    assert.equal(items.length, 0);
    const brief = buildMorningBrief({ attentionItems: items, today: [], potentialClients: [] });
    assert.equal(brief.key, 'managerHome.brief.allClear');
});

// --- Sort order ---

test('sortAttentionItems orders critical before medium within same tier', () => {
    const sorted = sortAttentionItems([
        { signalTier: 'hard', priority: 'medium', dueAt: null },
        { signalTier: 'hard', priority: 'critical', dueAt: '2026-09-07T00:00:00Z' },
        { signalTier: 'hard', priority: 'high', dueAt: '2026-09-08T00:00:00Z' },
    ]);
    assert.equal(sorted[0].priority, 'critical');
    assert.equal(sorted[1].priority, 'high');
});

test('TIER_RANK ensures hard before soft', () => {
    assert.ok(TIER_RANK.hard < TIER_RANK.soft);
});

test('flattenAttentionItems expands groups for counting', () => {
    const grouped = [{
        kind: 'group',
        signalType: 'no_activity',
        count: 3,
        members: [{ caseId: 1 }, { caseId: 2 }, { caseId: 3 }],
    }];
    assert.equal(flattenAttentionItems(grouped).length, 3);
});
