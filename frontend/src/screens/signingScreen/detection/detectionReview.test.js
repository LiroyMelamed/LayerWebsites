import { mergeDetectedSpots, resolveSpotSignerIndex, uploadCurrentSigningFile } from './detectionReview';

const signers = [{ UserId: 11, Name: 'שוכר' }, { UserId: 22, Name: 'משכיר' }];
const spot = { pageNum: 1, x: 50, y: 400, width: 160, height: 50, signerUserId: 11 };

test('keeps every existing manual field and skips overlapping detection proposals', () => {
    const manual = { ...spot, type: 'text', fieldValue: '001234567', x: 55 };
    const result = mergeDetectedSpots([manual], [spot, { ...spot, x: 400 }]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(manual);
    expect(result[1]).toMatchObject({ x: 400, assignmentStatus: 'reviewed', type: 'signature' });
});

test('repeated detection does not duplicate fields and page boundaries remain distinct', () => {
    const result = mergeDetectedSpots([spot], [spot, { ...spot, pageNum: 2 }]);
    expect(mergeDetectedSpots(result, [spot])).toHaveLength(2);
});

test('does not accept malformed detection geometry', () => {
    expect(mergeDetectedSpots([], [{ ...spot, x: NaN }, { ...spot, width: -2 }, { ...spot, pageNum: 0 }])).toEqual([]);
});

test.each([null, undefined, ''])('empty signer index %s never becomes the first signer', value => {
    expect(resolveSpotSignerIndex(signers, { signerIndex: value })).toBeNull();
});

test('unresolved names and removed signer IDs cannot fall back to another signer', () => {
    expect(resolveSpotSignerIndex(signers, { signerIndex: 0, assignmentStatus: 'unassigned' })).toBeNull();
    expect(resolveSpotSignerIndex(signers, { signerUserId: 999, signerIndex: 0 })).toBeNull();
    expect(resolveSpotSignerIndex([...signers, signers[0]], { signerName: 'שוכר' })).toBeNull();
});

test('stable person identity survives signer reordering', () => {
    expect(resolveSpotSignerIndex([...signers].reverse(), { ...spot, signerIndex: 0 })).toBe(1);
});

test('shared submission upload cannot poison the current file key after a file change', async () => {
    const file = { name: 'first.pdf' }; let current = file, finish;
    const onFileKey = jest.fn();
    const request = uploadCurrentSigningFile({ file, currentFile: () => current, onFileKey,
        uploadFile: () => new Promise(resolve => { finish = resolve; }) });
    current = { name: 'second.pdf' }; finish({ key: 'old-key' });
    await expect(request).rejects.toMatchObject({ code: 'STALE_SIGNING_INPUT' });
    expect(onFileKey).not.toHaveBeenCalled();
});

test('shared upload reuses a key only for its still-current file', async () => {
    const file = { name: 'first.pdf' }, uploadFile = jest.fn();
    await expect(uploadCurrentSigningFile({ file, fileKey: 'key', currentFile: () => file, uploadFile })).resolves.toBe('key');
    expect(uploadFile).not.toHaveBeenCalled();
    await expect(uploadCurrentSigningFile({ file, fileKey: 'key', currentFile: () => null, uploadFile })).rejects.toMatchObject({ code: 'STALE_SIGNING_INPUT' });
});
