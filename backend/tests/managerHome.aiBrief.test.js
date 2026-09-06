const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildFactsSnapshot,
    generateAiMorningBrief,
    parseLlmLines,
    validateLinesAgainstFacts,
    factsFingerprint,
    invalidateAiBriefCache,
    __testReset,
} = require('../services/managerHome/aiBrief.service');

const samplePayload = {
    greeting: { managerName: 'Danny Cohen' },
    summary: {
        urgentCount: 2,
        needsAttentionCount: 5,
        unassignedCases: 1,
        noActivityCases: 3,
        signingPending: 4,
        signingExpiring: 1,
        signingExpired: 2,
        signingRejected: 0,
        potentialClientMeetings: 2,
        todayEventCount: 3,
    },
    attentionItems: [
        {
            kind: 'single',
            signalType: 'signing_expired',
            priority: 'critical',
            signalTier: 'hard',
            caseName: 'Case Alpha',
            managerName: 'Danny Cohen',
            reasonParams: { days: 2 },
        },
    ],
    managerWorkload: [
        {
            managerName: 'Danny Cohen',
            activeCases: 12,
            needsAttention: 4,
            urgentCases: 2,
            unassigned: false,
        },
    ],
    today: [
        { isPotentialClient: true },
        { isPotentialClient: false },
        { isPotentialClient: true },
    ],
};

test('buildFactsSnapshot includes only structured operational fields', () => {
    const facts = buildFactsSnapshot(samplePayload);

    assert.equal(facts.managerName, 'Danny Cohen');
    assert.equal(facts.summary.urgentCount, 2);
    assert.equal(facts.summary.unassignedCases, 1);
    assert.equal(facts.topAttention.length, 1);
    assert.equal(facts.topAttention[0].signalType, 'signing_expired');
    assert.equal(facts.topAttention[0].caseName, 'Case Alpha');
    assert.equal(facts.workload[0].activeCases, 12);
    assert.equal(facts.today.count, 3);
    assert.equal(facts.today.potentialClientCount, 2);
    assert.deepEqual(Object.keys(facts.summary).sort(), [
        'needsAttentionCount',
        'noActivityCases',
        'potentialClientMeetings',
        'signingExpired',
        'signingExpiring',
        'signingPending',
        'signingRejected',
        'todayEventCount',
        'unassignedCases',
        'urgentCount',
    ]);
});

test('parseLlmLines parses JSON and plain bullet text', () => {
    const json = parseLlmLines('{"lines":["יש 2 חתימות שפג תוקפן","3 פגישות היום"]}');
    assert.deepEqual(json, ['יש 2 חתימות שפג תוקפן', '3 פגישות היום']);

    const bullets = parseLlmLines('• תיק Case Alpha דורש טיפול\n- 3 פגישות היום');
    assert.deepEqual(bullets, ['תיק Case Alpha דורש טיפול', '3 פגישות היום']);

    assert.equal(parseLlmLines('מצטער, אירעה שגיאה'), null);
});

test('validateLinesAgainstFacts rejects generic fluff', () => {
    const facts = buildFactsSnapshot(samplePayload);

    assert.equal(
        validateLinesAgainstFacts(['יש 2 חתימות שפג תוקפן ו-3 פגישות היום'], facts),
        true,
    );
    assert.equal(
        validateLinesAgainstFacts(['Have a wonderful productive day ahead!'], facts),
        false,
    );
});

test('generateAiMorningBrief returns parsed AI lines when enabled', async () => {
    const prevKey = process.env.CHATBOT_LLM_API_KEY;
    process.env.CHATBOT_LLM_API_KEY = 'test-key';
    __testReset();

    let calls = 0;
    const callLlmFn = async () => {
        calls += 1;
        return JSON.stringify({
            lines: ['יש 2 חתימות שפג תוקפן', '3 פגישות היום כולל 2 לקוחות פוטנציאליים'],
        });
    };

    try {
        const first = await generateAiMorningBrief({
            userId: 1,
            payload: samplePayload,
            callLlmFn,
            getSettingFn: async () => true,
        });
        assert.equal(first?.source, 'ai');
        assert.equal(first.lines.length, 2);

        const second = await generateAiMorningBrief({
            userId: 1,
            payload: samplePayload,
            callLlmFn,
            getSettingFn: async () => true,
        });
        assert.equal(second?.source, 'ai');
        assert.equal(calls, 1, 'second call should use cache');
    } finally {
        if (prevKey === undefined) delete process.env.CHATBOT_LLM_API_KEY;
        else process.env.CHATBOT_LLM_API_KEY = prevKey;
        __testReset();
    }
});

test('generateAiMorningBrief returns null when disabled', async () => {
    __testReset();

    const result = await generateAiMorningBrief({
        userId: 1,
        payload: samplePayload,
        callLlmFn: async () => '{"lines":["should not run"]}',
        getSettingFn: async () => false,
    });
    assert.equal(result, null);
});

test('generateAiMorningBrief returns null on malformed LLM output', async () => {
    const prevKey = process.env.CHATBOT_LLM_API_KEY;
    process.env.CHATBOT_LLM_API_KEY = 'test-key';
    __testReset();

    try {
        const result = await generateAiMorningBrief({
            userId: 1,
            payload: samplePayload,
            callLlmFn: async () => 'Have a wonderful productive day ahead!',
            getSettingFn: async () => true,
        });
        assert.equal(result, null);
    } finally {
        if (prevKey === undefined) delete process.env.CHATBOT_LLM_API_KEY;
        else process.env.CHATBOT_LLM_API_KEY = prevKey;
        __testReset();
    }
});

test('invalidateAiBriefCache clears cached briefs', async () => {
    const prevKey = process.env.CHATBOT_LLM_API_KEY;
    process.env.CHATBOT_LLM_API_KEY = 'test-key';
    __testReset();

    let calls = 0;
    const callLlmFn = async () => {
        calls += 1;
        return JSON.stringify({ lines: ['יש 2 חתימות שפג תוקפן'] });
    };

    try {
        await generateAiMorningBrief({
            userId: 2,
            payload: samplePayload,
            callLlmFn,
            getSettingFn: async () => true,
        });
        invalidateAiBriefCache();
        await generateAiMorningBrief({
            userId: 2,
            payload: samplePayload,
            callLlmFn,
            getSettingFn: async () => true,
        });
        assert.equal(calls, 2);
    } finally {
        if (prevKey === undefined) delete process.env.CHATBOT_LLM_API_KEY;
        else process.env.CHATBOT_LLM_API_KEY = prevKey;
        __testReset();
    }
});

test('factsFingerprint is stable for identical facts', () => {
    const a = buildFactsSnapshot(samplePayload);
    const b = buildFactsSnapshot(samplePayload);
    assert.equal(factsFingerprint(a), factsFingerprint(b));
});
