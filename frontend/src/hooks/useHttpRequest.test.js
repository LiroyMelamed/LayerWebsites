import { act, renderHook } from '@testing-library/react';
import useHttpRequest from './useHttpRequest';

jest.mock('../components/ui/showAppToast', () => ({ toastFromApiError: jest.fn() }));

test('exposes rejected requests and clears the error when a retry succeeds', async () => {
    const failure = new Error('offline');
    const request = jest.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce({ status: 200, data: ['case'] });
    const { result } = renderHook(() => useHttpRequest(request));
    await act(async () => { await result.current.performRequest(); });
    expect(result.current.error).toBe(failure);
    expect(result.current.isPerforming).toBe(false);
    await act(async () => { await result.current.performRequest(); });
    expect(result.current.error).toBeNull();
    expect(result.current.result).toEqual(['case']);
});

test('non-success HTTP responses expose an error while successful empty data does not', async () => {
    const failure = { status: 503, data: { message: 'unavailable' } };
    const request = jest.fn().mockResolvedValueOnce(failure).mockResolvedValueOnce({ status: 200, data: [] });
    const { result } = renderHook(() => useHttpRequest(request));
    await act(async () => { await result.current.performRequest(); });
    expect(result.current.error).toBe(failure);
    await act(async () => { await result.current.performRequest(); });
    expect(result.current.error).toBeNull();
    expect(result.current.result).toEqual([]);
});

test('an older failed request cannot replace a newer successful response', async () => {
    let rejectOld;
    const request = jest.fn()
        .mockImplementationOnce(() => new Promise((resolve, reject) => { rejectOld = reject; }))
        .mockResolvedValueOnce({ status: 200, data: ['current'] });
    const { result } = renderHook(() => useHttpRequest(request));
    let oldRequest;
    act(() => { oldRequest = result.current.performRequest(); });
    await act(async () => { await result.current.performRequest(); });
    await act(async () => { rejectOld(new Error('late failure')); await oldRequest; });
    expect(result.current.error).toBeNull();
    expect(result.current.result).toEqual(['current']);
});
