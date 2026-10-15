import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import useSigningDraft from './useSigningDraft';

if (!window.crypto) Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto });

const id = '10000000-0000-4000-8000-000000000001';
const payload = name => ({ request: { templateVersionId: id, name, rows: [] }, editor: { name } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function Harness({ api }) {
    const [name, setName] = useState('First'), [result, setResult] = useState('');
    const draft = useSigningDraft({ api, payload: payload(name), active: true, onRestore: value => setName(value.editor.name), onSubmitted: value => setResult(value.submissionId) });
    return <><input aria-label="Name" value={name} onChange={event => setName(event.target.value)} /><p role="status" aria-label="Save state">{draft.status}</p>
        <output aria-label="Result">{result}</output><button onClick={() => draft.flush().catch(() => {})}>Save</button>
        <button onClick={() => draft.submit(payload(name), 'a'.repeat(64)).then(value => setResult(value.submissionId)).catch(() => {})}>Submit</button>
        <button onClick={draft.reset}>New</button></>;
}
const apiFor = () => ({ draft: jest.fn(), saveDraft: jest.fn(async (draftId, input) => ({ id: draftId, version: input.expectedVersion + 1, updatedAt: '2026-10-08T00:00:00Z' })), submitDraft: jest.fn(async () => ({ result: { submissionId: 'same-run' } })) });
beforeEach(() => { window.history.replaceState(null, '', '/'); });
afterEach(() => { jest.useRealTimers(); });

test('automatic save persists on the server and places only a UUID in the URL', async () => {
    const api = apiFor(); render(<Harness api={api} />);
    await waitFor(() => expect(screen.getByRole('status', { name: 'Save state' })).toHaveTextContent('saved'), { timeout: 1500 });
    expect(api.saveDraft).toHaveBeenCalledTimes(1);
    expect(api.saveDraft.mock.calls[0][1]).toEqual({ expectedVersion: 0, payload: payload('First') });
    expect(new URL(window.location.href).searchParams.get('draft')).toMatch(/^[a-f0-9-]{36}$/i);
    expect(window.location.href).not.toContain('First');
});

test('concurrent saves serialize versions; a change during a save is not marked saved too soon', async () => {
    const api = apiFor(), first = deferred(); api.saveDraft.mockImplementationOnce(() => first.promise);
    render(<Harness api={api} />);
    fireEvent.click(screen.getByText('Save')); await waitFor(() => expect(api.saveDraft).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Second' } }); fireEvent.click(screen.getByText('Save'));
    expect(api.saveDraft).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve({ version: 1, updatedAt: '2026-10-08T00:00:00Z' }));
    await waitFor(() => expect(api.saveDraft).toHaveBeenCalledTimes(2));
    expect(api.saveDraft.mock.calls[1][1]).toEqual({ expectedVersion: 1, payload: payload('Second') });
    await waitFor(() => expect(screen.getByRole('status', { name: 'Save state' })).toHaveTextContent('saved'));
});

test('a stale-tab conflict keeps local edits and never submits a different server revision', async () => {
    const api = apiFor(); api.saveDraft.mockRejectedValue({ code: 'DRAFT_CHANGED' });
    render(<Harness api={api} />); fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Keep these edits' } });
    fireEvent.click(screen.getByText('Submit'));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Save state' })).toHaveTextContent('error'));
    expect(screen.getByLabelText('Name')).toHaveValue('Keep these edits'); expect(api.submitDraft).not.toHaveBeenCalled();
});

test('reopening a draft restores saved data and requires fresh preview before submission', async () => {
    window.history.replaceState(null, '', `/?draft=${id}`);
    const api = apiFor(); api.draft.mockResolvedValue({ id, version: 4, state: 'editing', payload: payload('Restored'), updatedAt: '2026-10-08T00:00:00Z' });
    render(<Harness api={api} />);
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Restored'));
    expect(api.submitDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Submit'));
    await waitFor(() => expect(screen.getByLabelText('Result')).toHaveTextContent('same-run'));
    expect(api.submitDraft).toHaveBeenCalledWith(id, { expectedVersion: 4, previewHash: 'a'.repeat(64) });
});

test('lost response after commit recovers the existing receipt without another creation', async () => {
    window.history.replaceState(null, '', `/?draft=${id}`);
    const api = apiFor(); api.draft.mockResolvedValue({ id, version: 5, state: 'submitted', payload: payload('Finished'), result: { submissionId: 'committed-once' } });
    render(<Harness api={api} />);
    await waitFor(() => expect(screen.getByLabelText('Result')).toHaveTextContent('committed-once'));
    expect(api.saveDraft).not.toHaveBeenCalled(); expect(api.submitDraft).not.toHaveBeenCalled();
});

test('an unmounted or reset editor cannot change the next screen URL when its save arrives late', async () => {
    const api = apiFor(), pending = deferred(); api.saveDraft.mockReturnValue(pending.promise);
    const view = render(<Harness api={api} />); fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(api.saveDraft).toHaveBeenCalled()); view.unmount(); window.history.replaceState(null, '', '/next-screen');
    await act(async () => pending.resolve({ version: 1 }));
    expect(window.location.pathname).toBe('/next-screen'); expect(window.location.search).toBe('');
});
