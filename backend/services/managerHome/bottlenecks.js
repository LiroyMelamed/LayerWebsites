const C = require('./constants');

function days(value) {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

// Work from the complete, tenant-scoped open-case query, before dashboard lists are capped.
// These measures locate missing progress records, not the cause of a legal delay.
function buildBottleneckFacts(caseRows = [], signingSummary = {}) {
    const cases = [...new Map(caseRows.filter(row => row.caseid != null && !row.isclosed)
        .map(row => [String(row.caseid), row])).values()];
    const groups = new Map();
    for (const row of cases) {
        const caseType = String(row.case_type || 'סוג תיק לא מוגדר').trim().slice(0, 100);
        const stage = days(row.currentstage);
        const key = JSON.stringify([row.casetypeid ?? caseType, stage]);
        if (!groups.has(key)) groups.set(key, { caseType, stage, total: 0, inactive: [], stageUpdate: [] });
        const group = groups.get(key);
        group.total += 1;
        const inactiveDays = days(row.days_since_meaningful_activity);
        const stageUpdateDays = days(row.days_in_current_stage);
        if (inactiveDays != null && inactiveDays >= C.NO_ACTIVITY_DAYS) {
            group.inactive.push(inactiveDays);
        } else if (stage != null && stageUpdateDays != null && stageUpdateDays >= C.LONG_STAGE_DAYS) {
            group.stageUpdate.push(stageUpdateDays);
        }
    }
    const findings = [];
    for (const group of groups.values()) {
        for (const [kind, values, thresholdDays] of [
            ['inactivity', group.inactive, C.NO_ACTIVITY_DAYS],
            ['stage_update', group.stageUpdate, C.LONG_STAGE_DAYS],
        ]) {
            if (!values.length) continue;
            findings.push({ kind, caseType: group.caseType, stage: group.stage, caseCount: values.length,
                groupCaseCount: group.total, thresholdDays, oldestDays: values.reduce((max, value) => Math.max(max, value), 0) });
        }
    }
    const unassigned = cases.filter(row => !row.casemanagerid).length;
    if (unassigned) findings.push({ kind: 'assignment', caseCount: unassigned });
    const waitingDocuments = days(signingSummary.waiting_long_count);
    const waitingCases = days(signingSummary.waiting_long_case_count);
    if (waitingDocuments > 0 && waitingCases > 0) {
        findings.push({ kind: 'signing', caseCount: waitingCases, documentCount: waitingDocuments,
            thresholdDays: C.SIGNING_PENDING_WARNING_DAYS, oldestDays: days(signingSummary.oldest_pending_days) });
    }
    const order = { assignment: 0, inactivity: 1, signing: 2, stage_update: 3 };
    findings.sort((a, b) => b.caseCount - a.caseCount || order[a.kind] - order[b.kind]
        || (b.oldestDays || 0) - (a.oldestDays || 0) || String(a.caseType || '').localeCompare(String(b.caseType || ''), 'he'));
    return {
        openCases: cases.length,
        casesWithActivityAge: cases.filter(row => days(row.days_since_meaningful_activity) != null).length,
        signingAgeAvailable: waitingDocuments != null && waitingCases != null,
        findings: findings.slice(0, 3),
    };
}

function describeFinding(finding) {
    const location = finding.stage == null
        ? `בתיקי ״${finding.caseType}״ ללא שלב מוגדר`
        : `בשלב ${finding.stage} בתיקי ״${finding.caseType}״`;
    switch (finding.kind) {
        case 'assignment':
            return {
                line: `${finding.caseCount} תיקים פתוחים אינם משויכים למנהל.`,
                action: `נקודת ההתחלה היא שיוך ${finding.caseCount} התיקים ללא מנהל לאחראי שיקבע את הצעד הבא בכל תיק.`,
            };
        case 'inactivity':
            return {
                line: `${location}: ${finding.caseCount} מתוך ${finding.groupCaseCount} תיקים ללא פעילות מתועדת לפחות ${finding.thresholdDays} ימים; בתיק הוותיק ביותר עברו ${finding.oldestDays} ימים מאז הפעילות האחרונה.`,
                action: `אפשר להתחיל ב־${finding.caseCount} התיקים ${location} ללא פעילות, ולתעד בכל אחד את הגורם שממתינים לו ואת האחראי לצעד הבא.`,
            };
        case 'stage_update':
            return {
                line: `${location}: ב־${finding.caseCount} מתוך ${finding.groupCaseCount} תיקים אין עדכון מתועד לשלב הנוכחי לפחות ${finding.thresholdDays} ימים; הפער הארוך ביותר הוא ${finding.oldestDays} ימים.`,
                action: `אפשר למקד את סקירת השלבים ב־${finding.caseCount} התיקים ${location}, ולוודא אם השלב הנוכחי משקף את העבודה שכבר בוצעה.`,
            };
        case 'signing':
            return {
                line: `השלמת חתימות: ${finding.documentCount} מסמכים ב־${finding.caseCount} תיקים פתוחים ממתינים לחתימה לפחות ${finding.thresholdDays} ימים${finding.oldestDays == null ? '.' : `; ההמתנה הארוכה ביותר היא ${finding.oldestDays} ימים.`}`,
                action: `אפשר להתחיל ב־${finding.documentCount} המסמכים שממתינים לחתימה לפחות ${finding.thresholdDays} ימים, ולברר אם חסר אישור, תיקון למסמך או קישור תקף.`,
            };
        default: return null;
    }
}

function buildBottleneckBrief(facts) {
    if (!facts || !Array.isArray(facts.findings)) return null;
    const descriptions = facts.findings.slice(0, 2).map(describeFinding).filter(Boolean);
    if (!descriptions.length) {
        const missingAge = Math.max(0, facts.openCases - facts.casesWithActivityAge);
        return { lines: [facts.openCases === 0 ? 'אין כרגע תיקים פתוחים לניתוח צווארי בקבוק.'
            : missingAge > 0 ? `חסר תאריך פעילות ב־${missingAge} מתוך ${facts.openCases} תיקים פתוחים; אי אפשר לקבוע מהם היכן מרוכזת ההמתנה.`
                : 'לא זוהה עיכוב במדדים שנבדקו. אין בכך אישור שכל התהליכים מתקדמים ללא עיכוב.'], recommendations: [] };
    }
    const lines = descriptions.map(value => value.line);
    if (facts.findings.slice(0, 2).some(finding => finding.kind !== 'assignment')) {
        lines.push('אלה נתונים לבדיקה לפי התיעוד במערכת. הנתונים אינם מזהים את סיבת ההמתנה או מוכיחים שהטיפול המשפטי נעצר.');
    }
    return { lines, recommendations: descriptions.map(value => value.action) };
}

module.exports = { buildBottleneckFacts, buildBottleneckBrief };
