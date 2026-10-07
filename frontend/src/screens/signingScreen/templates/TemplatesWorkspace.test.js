import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import api from '../../../api/signingTemplatesApi';
import BatchComposer from './BatchComposer';
import TemplatesWorkspace from './TemplatesWorkspace';

jest.mock('../../../api/signingTemplatesApi', () => ({ __esModule: true, default: {
    create: jest.fn(), list: jest.fn(), batches: jest.fn(), batch: jest.fn(), send: jest.fn(), contacts: jest.fn(),
} }));

// CRA's jsdom has no Web Crypto; browsers do.
if (!window.crypto?.randomUUID) Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto });

const deferred = () => { let resolve;const promise = new Promise(done => { resolve = done; });return { promise, resolve }; };
// Both clicks land before React re-renders, so the disabled attribute cannot stop the second one.
const doubleClick = button => act(() => { button.click();button.click(); });

beforeEach(() => jest.clearAllMocks());

test('a double click on create submits one batch with one idempotency key', async () => {
    const pending = deferred();api.create.mockReturnValue(pending.promise);
    const onCreated = jest.fn();
    const template = { id: 't-1', version: 1, name: 'Synthetic template', definition: { roles: [{ id: 'employee', name: 'Employee', shared: false }], documents: [{ id: 'd-1' }] } };
    render(<BatchComposer template={template} onBack={() => {}} onCreated={onCreated} />);
    const button = screen.getByRole('button', { name: 'יצירת החבילות לבדיקה' });
    doubleClick(button);
    expect(api.create).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ batch: { id: 'b-1' } }));
    expect(onCreated).toHaveBeenCalledWith('b-1');
});

test('a double click on send invites recipients once', async () => {
    const view = { batch: { id: 'b-1', name: 'Synthetic batch', status: 'ready', template_version: 1, snapshot: { packages: [{ label: 'Employee 1' }], definition: { documents: [{ id: 'd-1' }] } } },
        files: [], canDeliver: true, recipients: [{ id: 'r-1', name: 'Synthetic employee', status: 'pending', delivery_method: 'email' }] };
    api.list.mockResolvedValue({ templates: [] });
    api.batches.mockResolvedValue({ batches: [{ id: 'b-1', name: 'Synthetic batch', status: 'ready', created_at: '2026-10-07T08:00:00Z' }] });
    api.batch.mockResolvedValue(view);
    const pending = deferred();api.send.mockReturnValue(pending.promise);
    render(<TemplatesWorkspace onClose={() => {}} canUpload canManage />);
    const details = await screen.findByRole('button', { name: 'פרטי השליחה' });
    act(() => details.click());
    const button = await screen.findByRole('button', { name: 'שליחת ההזמנות לנמענים' });
    await waitFor(() => expect(button).toBeEnabled());
    doubleClick(button);
    expect(api.send).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ ...view, recipients: [{ ...view.recipients[0], status: 'sent' }] }));
    expect(screen.queryByRole('button', { name: 'שליחת ההזמנות לנמענים' })).toBeNull();
});
