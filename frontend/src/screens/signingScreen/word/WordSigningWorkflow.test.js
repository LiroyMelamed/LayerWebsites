import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WordSigningWorkflow, { validWordSigningDraft } from './WordSigningWorkflow';

let mockNativeProps, mockComposerProps;
jest.mock('../templates/useSigningLocale', () => () => ({ t: key => key, language: 'he', direction: 'rtl' }));
jest.mock('../templates/NativeTemplateBuilder', () => props => {
    mockNativeProps = props;
    return <button onClick={() => props.onSaved({ id: 'template-head', versionId: '44444444-4444-4444-8444-444444444444' })}>Publish reviewed fields</button>;
});
jest.mock('../templates/PackageComposer', () => props => { mockComposerProps = props; return <p>Explicit recipient selection</p>; });

const preview = { id: '11111111-1111-4111-8111-111111111111', sourceId: '22222222-2222-4222-8222-222222222222',
    sourceVersion: 3, pdfHash: 'a'.repeat(64), requiresFreshSigningGeometry: true, caseId: 41, clientId: 71 };
const response = () => {
    const source = { id: '33333333-3333-4333-8333-333333333333', hash: preview.pdfHash };
    const origin = { kind: 'word_preview', previewId: preview.id, sourceId: preview.sourceId,
        sourceVersion: preview.sourceVersion, pdfHash: preview.pdfHash, sourceHash: '1'.repeat(64),
        bindingsHash: '2'.repeat(64), filledDocxHash: '3'.repeat(64), valuesHash: '4'.repeat(64), inputsHash: '5'.repeat(64), authorUserId: 7 };
    return { source, origin, version: { id: '55555555-5555-4555-8555-555555555555',
        templateId: '66666666-6666-4666-8666-666666666666', editVersion: 1, state: 'draft',
        definition: { origin, documents: [{ sourceArtifactId: source.id, sourceHash: source.hash, fields: [] }] } } };
};
beforeEach(() => {
    mockNativeProps = null; mockComposerProps = null;
    Object.defineProperty(globalThis, 'crypto', { configurable: true,
        value: { randomUUID: () => '77777777-7777-4777-8777-777777777777' } });
});

test('registers the reviewed server preview then uses the exact published version with explicit recipient selection', async () => {
    const api = { nativeDraft: jest.fn().mockResolvedValue(response()) };
    render(<WordSigningWorkflow preview={preview} api={api} onBack={jest.fn()} />);
    await screen.findByRole('button', { name: 'Publish reviewed fields' });
    expect(api.nativeDraft).toHaveBeenCalledWith(preview.id, { expectedPdfHash: preview.pdfHash, locale: 'he' }, expect.any(String));
    expect(mockNativeProps.version.definition.documents[0].fields).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Publish reviewed fields' }));
    expect(mockComposerProps.initialTemplateId).toBe('44444444-4444-4444-8444-444444444444');
    expect(mockComposerProps.initialCaseId).toBe(41); expect(mockComposerProps.initialClientId).toBe(71);
    expect(mockComposerProps.lockedDocumentContext).toBe(true);
    expect(mockComposerProps).not.toHaveProperty('roles');
    expect(mockComposerProps).not.toHaveProperty('signatureSpots');
});

test.each(['hash', 'source', 'version', 'geometry'])('rejects a mismatched %s response before mounting a signing editor', async kind => {
    const value = response();
    if (kind === 'hash') value.origin.pdfHash = 'b'.repeat(64);
    if (kind === 'source') value.version.definition.documents[0].sourceArtifactId = preview.sourceId;
    if (kind === 'version') value.origin.sourceVersion += 1;
    if (kind === 'geometry') value.version.definition.documents[0].fields = [{ x: 10 }];
    expect(validWordSigningDraft(value, preview)).toBe(false);
    render(<WordSigningWorkflow preview={preview} api={{ nativeDraft: jest.fn().mockResolvedValue(value) }} />);
    await screen.findByRole('alert');
    expect(mockNativeProps).toBeNull();
});

test('a late response for an obsolete preview cannot replace the current final PDF', async () => {
    let release;
    const api = { nativeDraft: jest.fn().mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
        .mockRejectedValueOnce(new Error('VERSION_CHANGED')) };
    const { rerender } = render(<WordSigningWorkflow preview={preview} api={api} />);
    await waitFor(() => expect(api.nativeDraft).toHaveBeenCalledTimes(1));
    rerender(<WordSigningWorkflow preview={{ ...preview, pdfHash: 'b'.repeat(64) }} api={api} />);
    await screen.findByRole('alert');
    await act(async () => release(response()));
    expect(mockNativeProps).toBeNull();
    expect(screen.getByRole('alert')).toBeVisible();
});

test('invalid and unreviewed previews never reach the bridge', async () => {
    const api = { nativeDraft: jest.fn() }, onBack = jest.fn();
    render(<WordSigningWorkflow preview={{ ...preview, requiresFreshSigningGeometry: false }} api={api} onBack={onBack} />);
    await screen.findByRole('alert');
    expect(api.nativeDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('signingWord.nativeBack')); expect(onBack).toHaveBeenCalledTimes(1);
});
