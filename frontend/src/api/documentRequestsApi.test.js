import api from './documentRequestsApi';
import http from './apiUtils';
jest.mock('./apiUtils', () => ({ get: jest.fn(), put: jest.fn(), post: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); });

test('all stages share one read, while reopening gets fresh case data', async () => {
    let finish;
    http.get.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const stages = Array.from({ length: 30 }, () => api.list(123));
    expect(http.get).toHaveBeenCalledTimes(1);
    finish({ success: true, data: { requests: [] } });
    await expect(Promise.all(stages)).resolves.toHaveLength(30);
    http.get.mockResolvedValue({ success: true, data: { requests: [{ id: 1 }] } });
    await expect(api.list(123)).resolves.toEqual({ requests: [{ id: 1 }] });
    expect(http.get).toHaveBeenCalledTimes(2);
});

test('different cases and changed accounts cannot share an in-flight response', async () => {
    const resolvers = [];
    http.get.mockImplementation(() => new Promise(resolve => resolvers.push(resolve)));
    localStorage.setItem('token', 'synthetic-a');
    const a = api.list(1), other = api.list(2);
    localStorage.setItem('token', 'synthetic-b');
    const b = api.list(1);
    expect(http.get).toHaveBeenCalledTimes(3);
    resolvers[0]({ success: true, data: 'a' });
    await expect(a).resolves.toBe('a');
    expect(api.list(1)).toBe(b);
    resolvers[1]({ success: true, data: 'other' });
    resolvers[2]({ success: true, data: 'b' });
    await expect(other).resolves.toBe('other');
    await expect(b).resolves.toBe('b');
});

test('rate limiting rejects once without automatic retry; explicit retry is possible', async () => {
    http.get.mockResolvedValue({ success: false, status: 429, data: { errorCode: 'RATE_LIMITED' } });
    await expect(api.list(5)).rejects.toMatchObject({ response: { status: 429 } });
    expect(http.get).toHaveBeenCalledTimes(1);
    http.get.mockResolvedValue({ success: true, data: { requests: [] } });
    await expect(api.list(5)).resolves.toEqual({ requests: [] });
});

test('failed mutations cannot be presented as successful saves or sends', async () => {
    http.put.mockResolvedValue({ success: false, status: 409, data: { errorCode: 'DOCUMENT_REQUEST_CHANGED' } });
    http.post.mockResolvedValue({ success: false, status: 429 });
    await expect(api.save(1, {})).rejects.toMatchObject({ response: { data: { errorCode: 'DOCUMENT_REQUEST_CHANGED' } } });
    await expect(api.action(1, 2, {})).rejects.toMatchObject({ response: { status: 429 } });
});
