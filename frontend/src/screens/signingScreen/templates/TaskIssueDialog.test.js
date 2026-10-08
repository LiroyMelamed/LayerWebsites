import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import en from '../../../i18n/locales/en.json';
import TaskIssueDialog from './TaskIssueDialog';
if (!window.crypto) Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto });

async function show(props) {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({resources:{en:{translation:en}},lng:'en',interpolation:{escapeValue:false}});
    return render(<I18nextProvider i18n={i18n}><TaskIssueDialog documentName="Agreement" {...props}/></I18nextProvider>);
}
test('lost response retries exact note/key; rapid clicks and Escape cannot dismiss an in-flight request', async () => {
    let reject;
    const onSubmit = jest.fn().mockImplementationOnce(() => new Promise((_,no) => { reject = no; })).mockResolvedValue({});
    const onClose = jest.fn();
    await show({kind:'decline',onSubmit,onClose});
    const button=screen.getByRole('button',{name:'Confirm refusal'});
    fireEvent.click(button); fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});expect(onClose).not.toHaveBeenCalled();
    reject({code:'REQUEST_FAILED'});
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button',{name:'Confirm refusal'}));
    await waitFor(()=>expect(onClose).toHaveBeenCalledWith(true));
    expect(onSubmit.mock.calls[1]).toEqual(onSubmit.mock.calls[0]);
});
test('editing a failed note creates a distinct idempotency intent and renders text safely', async () => {
    const onSubmit=jest.fn().mockRejectedValueOnce({code:'REQUEST_FAILED'}).mockResolvedValue({});
    const onClose=jest.fn(); await show({kind:'clarify',onSubmit,onClose,originalNote:'<script>do not execute</script>'});
    fireEvent.change(screen.getByRole('textbox'),{target:{value:'First question'}});
    fireEvent.click(screen.getByRole('button',{name:'Send request to the office'}));await screen.findByRole('alert');
    fireEvent.change(screen.getByRole('textbox'),{target:{value:'Second question'}});
    fireEvent.click(screen.getByRole('button',{name:'Send request to the office'}));await waitFor(()=>expect(onClose).toHaveBeenCalledWith(true));
    expect(onSubmit.mock.calls[1][1]).not.toBe(onSubmit.mock.calls[0][1]);
    expect(screen.getByText('<script>do not execute</script>')).toBeVisible();
});
