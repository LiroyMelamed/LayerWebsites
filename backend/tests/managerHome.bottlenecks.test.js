const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const C = require('../services/managerHome/constants');
const { buildBottleneckFacts, buildBottleneckBrief } = require('../services/managerHome/bottlenecks');

const row = (id, extra = {}) => ({ caseid: id, casetypeid: 1, case_type: 'סוג בדיקה', currentstage: 2,
    casemanagerid: 7, days_since_meaningful_activity: 5, days_in_current_stage: 5, ...extra });

test('locates inactivity by case type and stage using all cases, without double counting or identities', () => {
    const cases = Array.from({ length: 123 }, (_, i) => row(i + 1, { days_since_meaningful_activity: 100 + i,
        casename: 'private case', client_name: 'private client', casemanager: 'private manager' }));
    const facts = buildBottleneckFacts([...cases, cases[0], row(999, { isclosed: true })]);
    assert.equal(facts.openCases, 123);
    assert.deepEqual(facts.findings[0], { kind: 'inactivity', caseType: 'סוג בדיקה', stage: 2,
        caseCount: 123, groupCaseCount: 123, thresholdDays: C.NO_ACTIVITY_DAYS, oldestDays: 222 });
    assert.equal(JSON.stringify(facts).includes('private'), false);
    const brief = buildBottleneckBrief(facts);
    assert.match(brief.lines[0], /בשלב 2/);
    assert.match(brief.lines[0], /123 מתוך 123/);
    assert.match(brief.lines[0], /222 ימים/);
    assert.match(brief.recommendations[0], /123 התיקים/);
});

test('same stage number in different case types is kept separate; activity and stage signals do not duplicate a case', () => {
    const facts = buildBottleneckFacts([
        row(1, { days_since_meaningful_activity: 95, days_in_current_stage: 95 }),
        row(2, { casetypeid: 2, case_type: 'סוג אחר', days_since_meaningful_activity: 101 }),
        row(3, { days_in_current_stage: 40 }),
    ]);
    assert.equal(facts.findings.length, 3);
    assert.equal(facts.findings.filter(f => f.kind === 'inactivity').reduce((n, f) => n + f.caseCount, 0), 2);
    assert.equal(facts.findings.find(f => f.kind === 'stage_update').caseCount, 1);
    assert.equal(facts.findings.find(f => f.kind === 'stage_update').groupCaseCount, 2);
    const brief = buildBottleneckBrief({ ...facts, findings: facts.findings.filter(f => f.kind === 'stage_update') });
    assert.match(brief.lines[0], /עדכון מתועד לשלב הנוכחי/);
    assert.doesNotMatch(brief.lines[0], /שהייה|משך הטיפול/);
});

test('unknown or invalid ages do not become zero or a confirmed delay', () => {
    const facts = buildBottleneckFacts([row(1, { days_since_meaningful_activity: null, days_in_current_stage: '' }),
        row(2, { days_since_meaningful_activity: -5, days_in_current_stage: 'bad' })]);
    assert.equal(facts.casesWithActivityAge, 0);
    assert.deepEqual(facts.findings, []);
    assert.match(buildBottleneckBrief(facts).lines[0], /חסר תאריך פעילות ב־2 מתוך 2/);
    assert.deepEqual(buildBottleneckBrief(facts).recommendations, []);
});

test('ranks affected cases, not document count, and never labels expired links as a proven legal delay', () => {
    const facts = buildBottleneckFacts([row(1, { casemanagerid: null }), row(2, { casemanagerid: null })], {
        waiting_long_count: 60, waiting_long_case_count: 1, oldest_pending_days: 9, expired: 60,
    });
    assert.equal(facts.findings[0].kind, 'assignment');
    assert.equal(facts.findings[1].documentCount, 60);
    const brief = buildBottleneckBrief(facts);
    assert.match(brief.lines[1], /60 מסמכים ב־1 תיקים/);
    assert.match(brief.lines.at(-1), /אינם מזהים את סיבת ההמתנה/);
    assert.doesNotMatch(brief.lines.join(' '), /סיכון קריטי|בית המשפט|אשמת/);
});

test('empty and recent portfolios do not manufacture a bottleneck or generic recommendations', () => {
    assert.match(buildBottleneckBrief(buildBottleneckFacts([])).lines[0], /אין כרגע תיקים פתוחים/);
    const brief = buildBottleneckBrief(buildBottleneckFacts([row(1)], { waiting_long_count: 0, waiting_long_case_count: 0 }));
    assert.match(brief.lines[0], /לא זוהה עיכוב/);
    assert.deepEqual(brief.recommendations, []);
});

test('insight copy describes measured findings directly without the removed label', () => {
    const findings = [
        {kind:'assignment',caseCount:2},
        {kind:'inactivity',caseType:'בדיקה',stage:2,caseCount:3,groupCaseCount:5,thresholdDays:90,oldestDays:93},
        {kind:'stage_update',caseType:'בדיקה',stage:2,caseCount:3,groupCaseCount:5,thresholdDays:30,oldestDays:43},
        {kind:'signing',caseCount:2,documentCount:4,thresholdDays:3,oldestDays:7},
    ];
    for (const finding of findings) {
        const result = buildBottleneckBrief({openCases:5,casesWithActivityAge:5,findings:[finding]});
        assert.doesNotMatch(JSON.stringify(result), /מוקד/);
        assert.ok(result.lines[0].includes(String(finding.caseCount)));
    }
});

test('actual signing aggregate covers more than the queue limit and excludes closed, orphan and completed documents', async () => {
    const db = new PGlite();
    try {
        await db.exec(`CREATE TABLE cases (caseid int PRIMARY KEY, isclosed boolean);
            CREATE TABLE signingfiles (caseid int, status text, createdat timestamptz, expiresat timestamptz, signedat timestamptz);
            INSERT INTO cases VALUES (1, false), (2, false), (3, true);
            INSERT INTO signingfiles SELECT 1, 'pending', NOW() - INTERVAL '9 days', NOW() - INTERVAL '1 day', NULL FROM generate_series(1, 60);
            INSERT INTO signingfiles VALUES (2, 'pending', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 hour', NULL),
                (3, 'pending', NOW() - INTERVAL '99 days', NULL, NULL),
                (NULL, 'pending', NOW() - INTERVAL '199 days', NULL, NULL),
                (2, 'signed', NOW() - INTERVAL '299 days', NULL, NOW());`);
        const source = fs.readFileSync(require.resolve('../services/managerHome/managerHome.service'), 'utf8');
        const functionSource = source.slice(source.indexOf('async function fetchSigningSummary()'), source.indexOf('async function fetchPendingRsvpEvents()'));
        const fetchSummary = new Function('pool', 'C', 'JERUSALEM_TODAY', `${functionSource}; return fetchSigningSummary;`)(db, C, `(NOW() AT TIME ZONE 'Asia/Jerusalem')::date`);
        const summary = await fetchSummary();
        assert.equal(summary.waiting_long_count, 60);
        assert.equal(summary.waiting_long_case_count, 1);
        assert.equal(summary.oldest_pending_days, 9);
        const finding = buildBottleneckFacts([row(1), row(2)], summary).findings[0];
        assert.equal(finding.kind, 'signing');
        assert.equal(finding.documentCount, 60);
        assert.equal(finding.caseCount, 1);
    } finally { await db.close(); }
});
