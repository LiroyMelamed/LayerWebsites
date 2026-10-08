import React from 'react';
import useSigningLocale from './useSigningLocale';
import TemplateDataValueInput from './TemplateDataValueInput';

export default function TemplateDocumentCondition({ fields, condition, onChange }) {
    const { t, number, direction } = useSigningLocale();
    const text = (key, values) => t(`signingV2.authoring.condition.${key}`, values);
    const field = fields.find(item => item.key === condition?.key);
    const empty = field?.type === 'boolean' ? false : '';
    return <details className="lw-templates__condition" open={condition ? true : undefined}>
        <summary>{text('title')}</summary><p>{text('help')}</p>
        <label>{text('field')}<select dir={direction} value={condition?.key || ''} onChange={event => onChange(event.target.value ? { key: event.target.value, operator: 'present' } : null)}>
            <option value="">{text('always')}</option>
            {condition && !field && <option value={condition.key}>{text('missing')}</option>}
            {fields.map(item => <option key={item.key} value={item.key}>{item.label || item.key}</option>)}
        </select></label>
        {condition && field && <>
            <label>{text('operator')}<select dir={direction} value={condition.operator} onChange={event => {
                const operator = event.target.value;
                onChange({ key: field.key, operator, ...(operator === 'equals' ? { value: empty } : operator === 'in' ? { values: [empty] } : {}) });
            }}>{['present', 'equals', 'in'].map(operator => <option key={operator} value={operator}>{text(operator)}</option>)}</select></label>
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
        </>}
    </details>;
}
