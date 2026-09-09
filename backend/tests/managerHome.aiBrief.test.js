const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildFactsSnapshot,
    generateAiMorningBrief,
    parseLlmBrief,
    parseLlmLines,
    validateLinesAgainstFacts,
    validateRecommendationsAgainstFacts,
    factsFingerprint,
    invalidateAiBriefCache,
    __testReset,
} = require('../services/managerHome/aiBrief.service');
const { buildOperationalInsights } = require('../services/managerHome/operationalInsights');

const samplePayload = {
    greeting: { managerName: 'Danny Cohen' },
    summary: {
        urgentCount: 2,
        needsAttentionCount: 5,
        attentionRawCount: 7,
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
        { isPotentialClient: true, title: 'Lead A', startTime: '2026-09-06T14:00:00.000Z' },
        { isPotentialClient: false, title: 'Internal', startTime: '2026-09-06T16:00:00.000Z' },
        { isPotentialClient: true, title: 'Lead B', startTime: '2026-09-06T18:00:00.000Z' },
    ],
};

test('buildFactsSnapshot includes only structured operational fields', () => {
    const facts = buildFactsSnapshot(samplePayload, {
        now: new Date('2026-09-06T08:00:00.000Z'),
    });

    assert.equal(facts.managerName, 'Danny Cohen');
    assert.equal(facts.summary.urgentCount, 2);
    assert.equal(facts.summary.unassignedCases, 1);
    assert.equal(facts.topAttention.length, 1);
    assert.equal(facts.topAttention[0].signalType, 'signing_expired');
    assert.equal(facts.topAttention[0].caseName, 'Case Alpha');
    assert.equal(facts.workload[0].activeCases, 12);
    assert.equal(facts.today.count, 3);
    assert.ok(facts.contextNow?.localDateTime);
    assert.ok(facts.insights?.signingPressure);
    assert.ok(Array.isArray(facts.insights?.focusAreas));
    assert.deepEqual(Object.keys(facts.summary).sort(), [
        'attentionQueueCount',
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

test('parseLlmBrief parses lines and recommendations', () => {
    const brief = parseLlmBrief(JSON.stringify({
        lines: ['יש 2 חתימות שפג תוקפן'],
        recommendations: ['טפלו ב-2 חתימות שפג תוקפן', 'בדקו 4 חתימות ממתינות'],
    }));
    assert.deepEqual(brief.lines, ['יש 2 חתימות שפג תוקפן']);
    assert.equal(brief.recommendations.length, 2);
});

test('validateRecommendationsAgainstFacts rejects invented numbers', () => {
    const facts = buildFactsSnapshot(samplePayload, {
        now: new Date('2026-09-06T10:00:00.000+03:00'),
    });
    assert.equal(
        validateRecommendationsAgainstFacts(['טפלו ב-2 חתימות שפג תוקפן'], facts),
        true,
    );
    assert.equal(
        validateRecommendationsAgainstFacts(['Review everything tomorrow'], facts),
        false,
    );
});

test('buildOperationalInsights computes signing and workload signals', () => {
    const insights = buildOperationalInsights({
        ...samplePayload,
        firmStats: {
            openCases: 100,
            casesOpenedToday: 3,
            casesClosedToday: 1,
        },
    });

    assert.equal(insights.signingPressure.expired, 2);
    assert.equal(insights.signingPressure.isTopRisk, true);
    assert.equal(insights.inactivityBurden.noActivityCases, 3);
    assert.equal(insights.inactivityBurden.attentionQueueCount, 7);
    assert.equal(insights.dayMomentum.trend, 'opening');
    assert.equal(insights.focusAreas[0].signalType, 'signing_expired');
    assert.equal(insights.workloadHotspots[0].managerName, 'Danny Cohen');
    assert.match(insights.workloadHotspots[0].attentionSummaryHe, /מתוך 12 תיקים פתוחים, 4 \(33%\)/);
});

test('generateAiMorningBrief returns recommendations when valid', async () => {
    const prevKey = process.env.CHATBOT_LLM_API_KEY;
    process.env.CHATBOT_LLM_API_KEY = 'test-key';
    __testReset();

    try {
        const result = await generateAiMorningBrief({
            userId: 4,
            payload: samplePayload,
            callLlmFn: async () => JSON.stringify({
                lines: ['יש 2 חתימות שפג תוקפן', '4 חתימות ממתינות לטיפול'],
                recommendations: ['טפלו ב-2 חתימות שפג תוקפן', 'עקבו אחר 4 חתימות ממתינות'],
            }),
            getSettingFn: async () => true,
            isPlatformAdminFn: async () => true,
            now: new Date('2026-09-06T10:00:00.000+03:00'),
        });
        assert.equal(result.recommendations.length, 2);
    } finally {
        if (prevKey === undefined) delete process.env.CHATBOT_LLM_API_KEY;
        else process.env.CHATBOT_LLM_API_KEY = prevKey;
        __testReset();
    }
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
        const fixedNow = new Date('2026-09-06T10:00:00.000+03:00');
        const first = await generateAiMorningBrief({
            userId: 1,
            payload: samplePayload,
            callLlmFn,
            getSettingFn: async () => true,
            isPlatformAdminFn: async () => true,
            isPlatformAdminFn: async () => true,
            now: fixedNow,
        });
        assert.equal(first?.source, 'ai');
        assert.equal(first.lines.length, 2);

        const second = await generateAiMorningBrief({
            userId: 1,
            payload: samplePayload,
            callLlmFn,
            getSettingFn: async () => true,
            isPlatformAdminFn: async () => true,
            now: fixedNow,
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
            isPlatformAdminFn: async () => true,
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
            isPlatformAdminFn: async () => true,
        });
        invalidateAiBriefCache();
        await generateAiMorningBrief({
            userId: 2,
            payload: samplePayload,
            callLlmFn,
            getSettingFn: async () => true,
            isPlatformAdminFn: async () => true,
        });
        assert.equal(calls, 2);
    } finally {
        if (prevKey === undefined) delete process.env.CHATBOT_LLM_API_KEY;
        else process.env.CHATBOT_LLM_API_KEY = prevKey;
        __testReset();
    }
});

test('sanitizeAiBriefLines removes greeting duplicates', () => {
    const { sanitizeAiBriefLines } = require('../services/managerHome/aiBrief.service');
    const facts = { managerName: 'לירוי' };
    const lines = sanitizeAiBriefLines([
        'בוקר טוב לירוי,',
        'אין נושאים דחופים היום.',
        '14 חתימות ממתינות.',
    ], facts);
    assert.deepEqual(lines, [
        'אין נושאים דחופים היום.',
        '14 חתימות ממתינות.',
    ]);
});

test('factsFingerprint is stable for identical facts', () => {
    const now = new Date('2026-09-06T17:55:00.000+03:00');
    const a = buildFactsSnapshot(samplePayload, { now });
    const b = buildFactsSnapshot(samplePayload, { now });
    assert.equal(factsFingerprint(a), factsFingerprint(b));
});

test('buildFactsSnapshot excludes leave and holiday events from AI facts', () => {
    const payload = {
        ...samplePayload,
        today: [
            {
                title: 'נוה חופשה',
                eventType: 'leave',
                startTime: '2026-09-07T21:00:00.000Z',
                managerName: 'ליאב מלמד',
            },
            {
                title: 'Client meeting',
                eventType: 'appointment',
                startTime: '2026-09-06T16:00:00.000Z',
                managerName: 'Danny Cohen',
                caseId: 1,
            },
        ],
        potentialClients: [
            {
                title: 'נוה חופשה',
                event_type: 'leave',
                startTime: '2026-09-07T21:00:00.000Z',
                managerName: 'ליאב מלמד',
            },
        ],
    };

    const facts = buildFactsSnapshot(payload, {
        now: new Date('2026-09-06T18:00:00.000+03:00'),
    });

    assert.equal(facts.today.count, 1);
    assert.equal(facts.today.upcomingCount, 1);
    assert.equal(facts.today.upcomingEvents[0].title, 'Client meeting');
    assert.deepEqual(facts.upcomingClientMeetings, []);
});

test('buildFactsSnapshot excludes past meetings from upcoming events at evening', () => {
    const payload = {
        ...samplePayload,
        attentionItems: [
            ...samplePayload.attentionItems,
            {
                kind: 'single',
                entityType: 'calendar',
                signalType: 'rsvp_pending',
                priority: 'medium',
                signalTier: 'soft',
                subtitle: 'רועי רגולציה',
                managerName: 'ליאב מלמד',
                dueAt: '2026-09-06T08:00:00.000Z',
                reasonParams: {
                    title: 'רועי רגולציה',
                    when: '06/09, 11:00',
                },
            },
        ],
        today: [
            {
                title: 'רועי רגולציה',
                startTime: '2026-09-06T08:00:00.000Z',
                managerName: 'ליאב מלמד',
                isPotentialClient: false,
            },
        ],
        summary: {
            ...samplePayload.summary,
            todayEventCount: 1,
        },
    };

    const evening = new Date('2026-09-06T17:55:00.000+03:00');
    const facts = buildFactsSnapshot(payload, { now: evening });

    assert.equal(facts.contextNow.period, 'evening');
    assert.equal(facts.today.pastCount, 1);
    assert.equal(facts.today.upcomingCount, 0);
    assert.deepEqual(facts.today.upcomingEvents, []);
    assert.equal(
        facts.topAttention.some((item) => item.signalType === 'rsvp_pending'),
        false,
        'past RSVP should not appear in topAttention',
    );
});

test('generateAiMorningBrief cache key rotates hourly even when facts are unchanged', async () => {
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
            userId: 3,
            payload: samplePayload,
            callLlmFn,
            getSettingFn: async () => true,
            isPlatformAdminFn: async () => true,
            now: new Date('2026-09-06T17:55:00.000+03:00'),
        });
        await generateAiMorningBrief({
            userId: 3,
            payload: samplePayload,
            callLlmFn,
            getSettingFn: async () => true,
            isPlatformAdminFn: async () => true,
            now: new Date('2026-09-06T18:05:00.000+03:00'),
        });
        assert.equal(calls, 2, 'different hour bucket should bypass cache');
    } finally {
        if (prevKey === undefined) delete process.env.CHATBOT_LLM_API_KEY;
        else process.env.CHATBOT_LLM_API_KEY = prevKey;
        __testReset();
    }
});
