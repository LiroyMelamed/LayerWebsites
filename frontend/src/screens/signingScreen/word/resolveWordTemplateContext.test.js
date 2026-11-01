import resolveWordTemplateContext from './resolveWordTemplateContext';

const origin = { kind: 'word_preview', previewId: '11111111-1111-4111-8111-111111111111',
    sourceId: '22222222-2222-4222-8222-222222222222', sourceVersion: 3, pdfHash: 'a'.repeat(64) };
const template = { versionId: '33333333-3333-4333-8333-333333333333', origin };
const preview = { id: origin.previewId, sourceId: origin.sourceId, sourceVersion: origin.sourceVersion,
    pdfHash: origin.pdfHash, clientId: 71, caseId: 41 };
const apiFor = overrides => ({ wordPreviewInfo: jest.fn().mockResolvedValue({ preview }),
    clientContext: jest.fn().mockResolvedValue({ id: 71, name: 'Synthetic client' }),
    caseContext: jest.fn().mockResolvedValue({ id: 41, name: 'Synthetic case', people: [] }), ...overrides });

test('saved native Word recovers authoritative references and locks them without assigning recipients', async () => {
    const api = apiFor();
    const result = await resolveWordTemplateContext(api, template);
    expect(api.wordPreviewInfo).toHaveBeenCalledWith(origin.previewId);
    expect(api.clientContext).toHaveBeenCalledWith(71); expect(api.caseContext).toHaveBeenCalledWith(41);
    expect(result).toEqual({ clientContext: { id: 71, name: 'Synthetic client' },
        caseContext: { id: 41, name: 'Synthetic case', people: [] }, lockedClientId: 71, lockedCaseId: 41 });
    expect(result).not.toHaveProperty('recipients');
});

test.each(['id', 'sourceId', 'sourceVersion', 'pdfHash'])('rejects a substituted %s before reading records', async key => {
    const changed = { ...preview, [key]: key === 'sourceVersion' ? 4 : 'wrong' };
    const api = apiFor({ wordPreviewInfo: jest.fn().mockResolvedValue({ preview: changed }) });
    await expect(resolveWordTemplateContext(api, template)).rejects.toHaveProperty('code', 'WORD_CONTEXT_CHANGED');
    expect(api.clientContext).not.toHaveBeenCalled(); expect(api.caseContext).not.toHaveBeenCalled();
});

test('different explicit route or restored-draft context fails instead of silently replacing intent', async () => {
    const api = apiFor();
    await expect(resolveWordTemplateContext(api, template, { clientId: 99 })).rejects.toHaveProperty('code', 'WORD_CONTEXT_CHANGED');
    await expect(resolveWordTemplateContext(api, template, { clientId: 71, caseId: 41 }, { caseId: 99 })).rejects.toHaveProperty('code', 'WORD_CONTEXT_CHANGED');
    expect(api.clientContext).not.toHaveBeenCalled();
});

test('revoked access and a substituted record stay rejected', async () => {
    const denied = Object.assign(new Error('Access unavailable'), { code: 'NOT_FOUND' });
    await expect(resolveWordTemplateContext(apiFor({ caseContext: jest.fn().mockRejectedValue(denied) }), template)).rejects.toBe(denied);
    await expect(resolveWordTemplateContext(apiFor({ clientContext: jest.fn().mockResolvedValue({ id: 99 }) }), template))
        .rejects.toHaveProperty('code', 'WORD_CONTEXT_CHANGED');
});

test('null source associations remain uninferred and unlocked', async () => {
    const api = apiFor({ wordPreviewInfo: jest.fn().mockResolvedValue({ preview: { ...preview, caseId: null, clientId: null } }) });
    expect(await resolveWordTemplateContext(api, template)).toEqual({ clientContext: null, caseContext: null, lockedClientId: null, lockedCaseId: null });
    expect(api.clientContext).not.toHaveBeenCalled(); expect(api.caseContext).not.toHaveBeenCalled();
    const explicit = await resolveWordTemplateContext(api, template, { caseId: '41' });
    expect(explicit.caseContext.id).toBe(41); expect(explicit.lockedCaseId).toBeNull();
});

test('ordinary native and legacy selections do not call any Word or record API', async () => {
    const api = apiFor();
    expect(await resolveWordTemplateContext(api, { origin: null })).toBeNull();
    expect(await resolveWordTemplateContext(api, { origin: { kind: 'legacy_template' } })).toBeNull();
    expect(api.wordPreviewInfo).not.toHaveBeenCalled(); expect(api.clientContext).not.toHaveBeenCalled();
});
