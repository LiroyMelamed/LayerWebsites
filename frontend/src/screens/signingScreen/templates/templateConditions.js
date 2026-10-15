export function conditionUses(condition, key) {
    return condition?.key === key || (condition?.conditions || []).some(child => conditionUses(child, key));
}

export function conditionSize(condition) {
    return condition ? 1 + (condition.conditions || []).reduce((sum, child) => sum + conditionSize(child), 0) : 0;
}

// The review mirrors the authored rule, including grouping and literal values.
// Never translate document content or round an authored decimal/identifier.
export function conditionSummary(condition, fields, t) {
    if (!condition) return t('always');
    if (condition.conditions) return `(${condition.conditions.map(child => conditionSummary(child, fields, t)).join(` ${t(condition.operator === 'all' ? 'and' : 'or')} `)})`;
    const field = fields.find(item => item.key === condition.key);
    const label = field?.label || field?.key || t('missing');
    if (condition.operator === 'present') return t('summaryPresent', { field: label });
    const format = value => typeof value === 'boolean' ? t(value ? 'true' : 'false') : String(value ?? '');
    return t(condition.operator === 'in' ? 'summaryIn' : 'summaryEquals', {
        field: label, value: condition.operator === 'in' ? (condition.values || []).map(format).join(', ') : format(condition.value),
    });
}
