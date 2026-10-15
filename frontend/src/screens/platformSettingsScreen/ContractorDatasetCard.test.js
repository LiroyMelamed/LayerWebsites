import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ContractorDatasetCard, { CM_DATASETS } from './ContractorDatasetCard';
jest.mock('../../components/simpleComponents/SimpleContainer', () => {
    const React = require('react'); return ({ children }) => React.createElement('div', null, children);
});
jest.mock('../../components/simpleComponents/SimpleCard', () => {
    const React = require('react'); return ({ children }) => React.createElement('section', null, children);
});
jest.mock('../../components/specializedComponents/text/AllTextKindFile', () => {
    const React = require('react'); const Text = ({ children }) => React.createElement('span', null, children);
    return { Text12: Text, Text14: Text, TextBold14: Text };
});
function Input({ setting, value, onChange }) {
    return setting.valueType === 'boolean'
        ? <input aria-label={setting.label} type="checkbox" checked={value === true || value === 'true'} onChange={e => onChange(e.target.checked ? 'true' : 'false')} />
        : <input aria-label={setting.label} value={value} onChange={e => onChange(e.target.value)} />;
}
function props(key = 'ACTIVE_SITES', values = {}) {
    return { dataset: CM_DATASETS.find(d => d.key === key), getValue: (k, fallback = '') => values[k] ?? fallback,
        onChange: jest.fn(), SettingInput: Input, tenantName: 'melamedlaw' };
}
test('new source starts disabled with explicit blank recipients and clear source limitations', () => {
    render(<ContractorDatasetCard {...props('ACTIVE_SITES', { CM_GLOBAL_EMAIL_RECIPIENTS: 'global@example.invalid', CM_GLOBAL_SMS_RECIPIENTS: '+19990000000' })} />);
    expect(screen.getByLabelText('מעקב פעיל').checked).toBe(false);
    expect(screen.getByLabelText('כלול בסיכום הכללי').checked).toBe(false);
    expect(screen.getByLabelText('נמעני אימייל לדוח הישיר').value).toBe('');
    expect(screen.getByLabelText('נמעני SMS (ריק = ללא SMS)').value).toBe('');
    expect(screen.getByText(/היעלמות מהמאגר אינה הוכחה לסגירת אתר/)).toBeTruthy();
    expect(screen.getByText(/הסיכום נשלח לנמעני האימייל הגלובליים/)).toBeTruthy();
    expect(screen.queryByText(/global@example.invalid/)).toBeNull();
});
test('email recipient edits and false toggles target the exact new setting keys', () => {
    const p = props('ACTIVE_SITES', { CM_ACTIVE_SITES_ENABLED: true, CM_ACTIVE_SITES_EMAIL_RECIPIENTS: 'saved@example.invalid' });
    const { rerender } = render(<ContractorDatasetCard {...p} />);
    expect(screen.getByLabelText('נמעני אימייל לדוח הישיר').value).toBe('saved@example.invalid');
    fireEvent.change(screen.getByLabelText('נמעני אימייל לדוח הישיר'), { target: { value: 'new@example.invalid' } });
    expect(p.onChange).toHaveBeenCalledWith('CM_ACTIVE_SITES_EMAIL_RECIPIENTS', 'new@example.invalid');
    fireEvent.click(screen.getByLabelText('מעקב פעיל'));
    expect(p.onChange).toHaveBeenCalledWith('CM_ACTIVE_SITES_ENABLED', 'false');
    rerender(<ContractorDatasetCard {...props('ACTIVE_SITES', { CM_ACTIVE_SITES_ENABLED: false, CM_ACTIVE_SITES_EMAIL_RECIPIENTS: 'new@example.invalid' })} />);
    expect(screen.getByLabelText('מעקב פעיל').checked).toBe(false);
    expect(screen.getByLabelText('נמעני אימייל לדוח הישיר').value).toBe('new@example.invalid');
});
test('old source retains enabled default/global fallback explanation', () => {
    render(<ContractorDatasetCard {...props('PINKASH', { CM_GLOBAL_EMAIL_RECIPIENTS: 'global@example.invalid' })} />);
    expect(screen.getByLabelText('מעקב פעיל').checked).toBe(true);
    expect(screen.getByText('ברירת מחדל: global@example.invalid')).toBeTruthy();
    expect(screen.queryByLabelText('כלול בסיכום הכללי')).toBeNull();
});
for (const tenantName of ['morlevi', 'ashrafessa', 'idm', 'melamedia', '']) {
    test('card is not rendered for tenant ' + tenantName, () => {
        const { container } = render(<ContractorDatasetCard {...props()} tenantName={tenantName} />);
        expect(container.textContent).toBe('');
    });
}
