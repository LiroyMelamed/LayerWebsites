import SigningSelect from './SigningSelect';
import React from 'react';
import useSigningLocale from './useSigningLocale';
import TemplateDataValueInput from './TemplateDataValueInput';
import { conditionSize } from './templateConditions';

function ConditionRule({ fields, condition, onChange, depth = 0, total }) {
    const { t, number, direction } = useSigningLocale();
    const text = (key, values) => t(`signingV2.authoring.condition.${key}`, values);
    const field = fields.find(item => item.key === condition?.key);
    const empty = field?.type === 'boolean' ? false : '';
    const first = () => ({ key: fields[0].key, operator: 'present' });
    const canAdd = fields.length > 0 && total < 50 && depth < 4;
    if (condition?.conditions) return <div className="lw-templates__conditionGroup">
        <label>{text('combine')}<SigningSelect dir={direction} value={condition.operator} onChange={event => onChange({ ...condition, operator: event.target.value })}>
            <option value="all">{text('all')}</option><option value="any">{text('any')}</option>
        </SigningSelect></label>
        {condition.conditions.map((child, index) => <fieldset key={index}>
            <legend>{text('rule', { number: number(index + 1) })}</legend>
            <ConditionRule fields={fields} condition={child} depth={depth + 1} total={total} onChange={next => {
                const conditions = condition.conditions.map((item, i) => i === index ? next : item).filter(Boolean);
                onChange(conditions.length ? { ...condition, conditions } : null);
            }} />
            <button type="button" onClick={() => {
                const conditions = condition.conditions.filter((_, i) => i !== index);
                onChange(conditions.length ? { ...condition, conditions } : null);
            }}>{text('removeRule')}</button>
        </fieldset>)}
        <div className="lw-templates__actions">
            <button type="button" disabled={!canAdd || condition.conditions.length >= 20} onClick={() => onChange({ ...condition, conditions: [...condition.conditions, first()] })}>{text('addRule')}</button>
            <button type="button" disabled={!canAdd || depth >= 3 || total >= 49 || condition.conditions.length >= 20}
                onClick={() => onChange({ ...condition, conditions: [...condition.conditions, { operator: 'all', conditions: [first()] }] })}>{text('addGroup')}</button>
            <button type="button" onClick={() => onChange(null)}>{text('clear')}</button>
        </div>
    </div>;
    return <div className="lw-templates__conditionLeaf">
        <label>{text('field')}<SigningSelect dir={direction} value={condition?.key || ''} onChange={event => onChange(event.target.value ? { key: event.target.value, operator: 'present' } : null)}>
            <option value="">{text(depth > 0 ? 'removeRule' : 'always')}</option>
            {condition && !field && <option value={condition.key}>{text('missing')}</option>}
            {fields.map(item => <option key={item.key} value={item.key}>{item.label || item.key}</option>)}
        </SigningSelect></label>
        {condition && field && <>
            <label>{text('operator')}<SigningSelect dir={direction} value={condition.operator} onChange={event => {
                const operator = event.target.value;
                onChange({ key: field.key, operator, ...(operator === 'equals' ? { value: empty } : operator === 'in' ? { values: [empty] } : {}) });
            }}>{['present', 'equals', 'in'].map(operator => <option key={operator} value={operator}>{text(operator)}</option>)}</SigningSelect></label>
            {condition.operator === 'equals' && <TemplateDataValueInput field={field} label={text('value')} value={condition.value} onChange={value => onChange({ ...condition, value })} />}
            {condition.operator === 'in' && <>
                {(condition.values || []).map((value, index) => <div className="lw-templates__conditionValue" key={index}>
                    <TemplateDataValueInput field={field} label={text('numberedValue', { number: number(index + 1) })} value={value}
                        onChange={next => onChange({ ...condition, values: condition.values.map((item, i) => i === index ? next : item) })} />
                    <button type="button" disabled={condition.values.length <= 1} aria-label={text('removeValue', { number: number(index + 1) })}
                        onClick={() => onChange({ ...condition, values: condition.values.filter((_, i) => i !== index) })}>{text('remove')}</button>
                </div>)}
                <button type="button" disabled={(condition.values || []).length >= 50} onClick={() => onChange({ ...condition, values: [...(condition.values || []), empty] })}>{text('add')}</button>
            </>}
            {depth === 0 && <button type="button" disabled={!canAdd || total >= 49} onClick={() => onChange({ operator: 'all', conditions: [condition, first()] })}>{text('addRule')}</button>}
        </>}
    </div>;
}

export default function TemplateDocumentCondition({ fields, condition, onChange, kind = 'document' }) {
    const { t } = useSigningLocale();
    return <details className="lw-templates__condition" open={condition ? true : undefined}>
        <summary>{t(`signingV2.authoring.condition.${kind === 'role' ? 'roleTitle' : 'title'}`)}</summary><p>{t(`signingV2.authoring.condition.${kind === 'role' ? 'roleHelp' : 'help'}`)}</p>
        <ConditionRule fields={fields} condition={condition} onChange={onChange} total={conditionSize(condition)} />
    </details>;
}
