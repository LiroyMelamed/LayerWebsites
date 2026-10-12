import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import CalendarSmsTemplateEditor, { CALENDAR_SMS_VARS, renderSmsPreview as formatPreview } from './CalendarSmsTemplateEditor';
import englishLocale from '../../../i18n/locales/en.json';
let mockLabels = {};
const mockT = (key, options = {}) => mockLabels[key] || options.defaultValue || key;
beforeEach(() => { mockLabels = {}; });
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
function Draft({ initial = 'Hello TOKEN, bye', onDraft = jest.fn(), ...props }) {
    const [value, setValue] = useState(initial);
    return <CalendarSmsTemplateEditor title="Synthetic message" value={value} onChange={next => { onDraft(next); setValue(next); }} {...props} />;
}

test('supported meeting type chip inserts at selected text, updates controlled draft and real-value preview', () => {
    const onDraft = jest.fn(); render(<Draft onDraft={onDraft} defaultOpen previewValues={{ meetingTypeLabel: 'פגישה טלפונית' }} />);
    const textarea = screen.getByRole('textbox'); act(() => { textarea.focus(); textarea.setSelectionRange(6, 11); }); fireEvent.select(textarea);
    fireEvent.click(screen.getByRole('button', { name: 'סוג פגישה {{meetingTypeLabel}}' }));
    expect(CALENDAR_SMS_VARS).toContain('meetingTypeLabel'); expect(onDraft).toHaveBeenLastCalledWith('Hello {{meetingTypeLabel}}, bye');
    expect(textarea).toHaveValue('Hello {{meetingTypeLabel}}, bye'); expect(screen.getByText('Hello פגישה טלפונית, bye')).toBeInTheDocument();
});

test('editing custom message and closing/reopening retains draft; reset only explicitly restores supplied default', () => {
    const onDraft = jest.fn(); render(<Draft defaultValue="Default {{date}}" onDraft={onDraft} />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'ערוך הודעה' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Custom {{title}}' } }); expect(onDraft).toHaveBeenLastCalledWith('Custom {{title}}');
    fireEvent.click(screen.getByRole('button', { name: 'סגור עריכה' })); expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ערוך הודעה' })); expect(screen.getByRole('textbox')).toHaveValue('Custom {{title}}');
    fireEvent.click(screen.getByRole('button', { name: 'שחזר ברירת מחדל' })); expect(onDraft).toHaveBeenLastCalledWith('Default {{date}}'); expect(screen.getByRole('textbox')).toHaveValue('Default {{date}}');
    expect(screen.queryByRole('button', { name: 'שחזר ברירת מחדל' })).not.toBeInTheDocument();
});

test('all supported fields are available and exclusion hides invitation-only variable without dropping other chips', () => {
    const { rerender } = render(<Draft defaultOpen />);
    for (const key of CALENDAR_SMS_VARS) expect(screen.getByTitle(`{{${key}}}`)).toBeInTheDocument();
    rerender(<Draft defaultOpen excludeVars={['rsvpUrl']} />); expect(screen.queryByTitle('{{rsvpUrl}}')).not.toBeInTheDocument(); expect(screen.getByTitle('{{meetingTypeLabel}}')).toBeInTheDocument();
});

test('each real recipient receives a separate personalized preview and original template stays unmodified', () => {
    const onDraft = jest.fn(); render(<Draft initial="Hello {{recipientName}} at {{time}}" onDraft={onDraft} previewValues={{ time: '09:30' }} previewRecipients={[{ name: 'Dana', userId: 1 }, { name: 'Avi', phone: '0500000000' }]} />);
    expect(screen.getAllByText(/^Hello (Dana|Avi) at 09:30$/)).toHaveLength(2);
    expect(screen.getByText('Hello Dana at 09:30')).toBeInTheDocument(); expect(screen.getByText('Hello Avi at 09:30')).toBeInTheDocument(); expect(onDraft).not.toHaveBeenCalled();
});

test('phone and Zoom preview match place semantics and unresolved supported values remain readable', () => {
    const template = 'Hello {{recipientName}}\nכתובתנו היא {{address}}\nלהוראות הגעה בוויז {{wazeUrl}}\nמפות: {{mapsUrl}}';
    const phone = formatPreview(template, { recipientName: 'Dana', meetingType: 'phone', address: 'Old address', wazeUrl: 'https://waze.example.invalid', mapsUrl: 'https://maps.example.invalid' });
    expect(phone).toBe('Hello Dana');
    const zoom = formatPreview(template, { recipientName: 'Dana', meetingType: 'zoom', address: 'https://zoom.us/j/123' }); expect(zoom).toContain('קישור לזום: https://zoom.us/j/123'); expect(zoom).not.toContain('כתובתנו'); expect(zoom).not.toContain('מפות');
    expect(formatPreview('{{meetingTypeLabel}}', {})).toBe('"סוג פגישה"');
});


test('English variable labels appear on every supported chip and unresolved preview without changing the draft', () => {
    mockLabels = Object.fromEntries(Object.entries(englishLocale.calendar).map(([key, value]) => [`calendar.${key}`, value]));
    const onDraft = jest.fn();
    const template = 'Meeting: {{meetingTypeLabel}} at {{firmName}}';
    render(<Draft initial={template} onDraft={onDraft} defaultOpen />);
    for (const key of CALENDAR_SMS_VARS) {
        expect(screen.getByRole('button', { name: `${englishLocale.calendar[`smsVarLabel_${key}`]} {{${key}}}` })).toBeInTheDocument();
    }
    expect(screen.getByText('Meeting: "Meeting type" at "Office name"')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue(template);
    expect(onDraft).not.toHaveBeenCalled();
});

test('English UI keeps customer-authored Hebrew and English message text verbatim and inserts the original variable token', () => {
    mockLabels = Object.fromEntries(Object.entries(englishLocale.calendar).map(([key, value]) => [`calendar.${key}`, value]));
    const onDraft = jest.fn();
    const authored = 'שלום {{recipientName}}, פגישה {{meetingTypeLabel}} אצלנו. Authored English {{title}}';
    render(<Draft initial={authored} onDraft={onDraft} defaultOpen previewValues={{ recipientName: 'Dana', meetingTypeLabel: 'Remote call', title: 'Consultation', date: '12/10/2026' }} />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue(authored);
    expect(screen.getByText('שלום Dana, פגישה Remote call אצלנו. Authored English Consultation')).toBeInTheDocument();
    expect(onDraft).not.toHaveBeenCalled();
    act(() => { textarea.focus(); textarea.setSelectionRange(authored.length, authored.length); });
    fireEvent.select(textarea);
    fireEvent.click(screen.getByRole('button', { name: 'Date {{date}}' }));
    expect(onDraft).toHaveBeenLastCalledWith(`${authored}{{date}}`);
    expect(textarea).toHaveValue(`${authored}{{date}}`);
    expect(screen.getByText('שלום Dana, פגישה Remote call אצלנו. Authored English Consultation12/10/2026')).toBeInTheDocument();
});
