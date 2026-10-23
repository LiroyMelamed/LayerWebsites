import { act, renderHook } from '@testing-library/react';
import useSignatureDetection from './useSignatureDetection';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const first = { name: 'first.pdf' }, second = { name: 'second.pdf' };
const signers = [{ UserId: 1, Name: 'שוכר' }];
const spot = { pageNum: 1, x: 10, y: 20, width: 150, height: 50, assignmentStatus: 'unassigned' };
const base = () => ({ file: first, signers, fileKey: null, onFileKey: jest.fn(), uploadFile: jest.fn().mockResolvedValue({ key: 'users/1/first.pdf' }), detectSpots: jest.fn().mockResolvedValue({ spots: [spot], noTextPages: [] }) });

test('uploads only once and opens a review without approving or assigning the result', async () => {
    const props = base(); const { result } = renderHook(() => useSignatureDetection(props));
    await act(async () => { const request = result.current.detect(); result.current.detect(); await request; });
    expect(props.uploadFile).toHaveBeenCalledTimes(1);
    expect(props.detectSpots).toHaveBeenCalledTimes(1);
    expect(result.current.review.spots[0]).toEqual(spot);
    expect(result.current.detecting).toBe(false);
});

test('switching files while upload runs cannot store the old key or start detection', async () => {
    const upload = deferred(); const props = { ...base(), uploadFile: jest.fn(() => upload.promise) };
    const { result, rerender } = renderHook(p => useSignatureDetection(p), { initialProps: props });
    let request; act(() => { request = result.current.detect(); });
    rerender({ ...props, file: second });
    await act(async () => { upload.resolve({ key: 'old-key' }); await request; });
    expect(props.onFileKey).not.toHaveBeenCalled(); expect(props.detectSpots).not.toHaveBeenCalled();
    expect(result.current.review).toBeNull(); expect(result.current.detecting).toBe(false);
});

test.each(['file', 'signers'])('stale result after a %s change cannot replace the current review', async changed => {
    const pending = deferred(); const props = { ...base(), fileKey: 'key', detectSpots: jest.fn(() => pending.promise) };
    const { result, rerender } = renderHook(p => useSignatureDetection(p), { initialProps: props });
    let request; act(() => { request = result.current.detect(); });
    rerender({ ...props, [changed]: changed === 'file' ? second : [{ UserId: 2, Name: 'משכיר' }] });
    await act(async () => { pending.resolve({ spots: [spot] }); await request; });
    expect(result.current.review).toBeNull();
});

test('error ends the loader and allows a successful retry', async () => {
    const props = base(); props.detectSpots.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useSignatureDetection(props));
    await act(async () => { await result.current.detect(); });
    expect(result.current.error).toBe(true); expect(result.current.detecting).toBe(false);
    await act(async () => { await result.current.detect(); });
    expect(result.current.error).toBe(false); expect(result.current.review.spots).toHaveLength(1);
});

test('unmount discards pending work', async () => {
    const upload = deferred(); const props = { ...base(), uploadFile: jest.fn(() => upload.promise) };
    const { result, unmount } = renderHook(() => useSignatureDetection(props));
    let request; act(() => { request = result.current.detect(); }); unmount();
    await act(async () => { upload.resolve({ key: 'old-key' }); await request; });
    expect(props.detectSpots).not.toHaveBeenCalled(); expect(props.onFileKey).not.toHaveBeenCalled();
});

test('oversized or invalid results are not silently accepted as partial discovery', async () => {
    const props = base(); props.detectSpots.mockResolvedValueOnce({ spots: Array(201).fill(spot) })
        .mockResolvedValueOnce({ spots: [{ ...spot, width: -1 }] });
    const { result } = renderHook(() => useSignatureDetection(props));
    await act(async () => { await result.current.detect(); });
    expect(result.current.error).toBe(true); expect(result.current.review).toBeNull();
    await act(async () => { await result.current.detect(); });
    expect(result.current.error).toBe(true); expect(result.current.review).toBeNull();
});
