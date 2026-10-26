import { act, renderHook } from '@testing-library/react';
import useWordPreviewImport from './useWordPreviewImport';

const id = 'a8ed476a-6e05-4a04-8ad3-898d25456027';
const nextId = 'f0bc3ab5-ea0d-4e8f-a18f-3d29ddf30cc2';
const preview = { id, name: 'Rental.docx', pdfHash: 'a'.repeat(64), requiresFreshSigningGeometry: true, caseId: 12, clientId: 22 };
const blob = new Blob(['%PDF-synthetic'], { type: 'application/pdf' });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const setup = () => ({ api: { previewInfo: jest.fn().mockResolvedValue({ preview }), pdf: jest.fn().mockResolvedValue(blob) }, onLoaded: jest.fn() });

test('imports only the protected final PDF with trusted context and no signature fields or dispatch', async () => {
    const props = setup(); const { result } = renderHook(() => useWordPreviewImport({ previewId: id, ...props }));
    await act(async () => {});
    expect(result.current.status).toBe('ready'); expect(props.api.previewInfo).toHaveBeenCalledWith(id); expect(props.api.pdf).toHaveBeenCalledWith(id);
    const [file, metadata] = props.onLoaded.mock.calls[0]; expect(file).toBeInstanceOf(File); expect(file.name).toBe('Rental.pdf');
    expect(file.type).toBe('application/pdf'); expect(metadata).toBe(preview); expect(metadata.signatureSpots).toBeUndefined();
});
test('unmount before metadata resolves does not fetch content or initialize a stale draft', async () => {
    const pending = deferred(); const props = setup(); props.api.previewInfo.mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => useWordPreviewImport({ previewId: id, ...props })); unmount();
    await act(async () => { pending.resolve({ preview }); });
    expect(props.api.pdf).not.toHaveBeenCalled(); expect(props.onLoaded).not.toHaveBeenCalled();
});
test('changing previews discards an older PDF response', async () => {
    const pending = deferred(); const props = setup(); props.api.pdf.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(p => useWordPreviewImport({ ...props, ...p }), { initialProps: { previewId: id } });
    await act(async () => {});
    props.api.previewInfo.mockResolvedValue({ preview: { ...preview, id: nextId, name: 'New.pdf' } }); rerender({ previewId: nextId });
    await act(async () => {}); await act(async () => { pending.resolve(blob); });
    expect(props.onLoaded).toHaveBeenCalledTimes(1); expect(props.onLoaded.mock.calls[0][0].name).toBe('New.pdf'); expect(result.current.status).toBe('ready');
});
test.each([{ id: nextId }, { requiresFreshSigningGeometry: false }, { clientId: '22' }, { pdfHash: 'bad' }])('malformed metadata cannot populate the signing draft: %j', patch => {
    const props = setup(); props.api.previewInfo.mockResolvedValue({ preview: { ...preview, ...patch } });
    return (async () => { const { result } = renderHook(() => useWordPreviewImport({ previewId: id, ...props })); await act(async () => {});
        expect(result.current.status).toBe('error'); expect(props.onLoaded).not.toHaveBeenCalled(); expect(props.api.pdf).not.toHaveBeenCalled(); })();
});
test('HTML or denied PDF content fails closed; explicit retry can recover', async () => {
    const props = setup(); props.api.pdf.mockResolvedValueOnce(new Blob(['invalid'], { type: 'text/html' }));
    const { result } = renderHook(() => useWordPreviewImport({ previewId: id, ...props })); await act(async () => {});
    expect(result.current.status).toBe('error'); expect(props.onLoaded).not.toHaveBeenCalled();
    await act(async () => { result.current.retry(); }); await act(async () => {});
    expect(result.current.status).toBe('ready'); expect(props.onLoaded).toHaveBeenCalledTimes(1);
});
