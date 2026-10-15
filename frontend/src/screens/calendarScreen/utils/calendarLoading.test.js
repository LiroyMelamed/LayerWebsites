import { calendarRequestGate, loadCalendarPages } from './calendarLoading';

test('busy range loads all pages and preserves exact IDs without duplicates', async () => {
    const first = Array.from({ length: 500 }, (_, id) => ({ id, title: `Meeting ${id}` }));
    const second = [{ id: 499, title: 'Updated 499' }, { id: 500, title: 'Last meeting' }];
    const read = jest.fn().mockResolvedValueOnce({ status: 200, success: true, data: { events: first } })
        .mockResolvedValueOnce({ status: 200, success: true, data: { events: second } });
    const result = await loadCalendarPages(read, { from: '2026-10-01', scope: 'firm' });
    expect(result).toHaveLength(501);
    expect(result[499].title).toBe('Updated 499');
    expect(read.mock.calls[1][0]).toEqual({ from: '2026-10-01', scope: 'firm', limit: 500, offset: 500 });
});

test('an old in-flight result cannot expose another filter or scope', async () => {
    const gate = calendarRequestGate();
    const old = gate.next();
    let resolve;
    const read = jest.fn(() => new Promise((done) => { resolve = done; }));
    const pending = loadCalendarPages(read, { scope: 'firm' }, old);
    const newest = gate.next();
    resolve({ status: 200, success: true, data: { events: [{ id: 1 }] } });
    expect(await pending).toBeNull();
    expect(newest()).toBe(true);
});

test('scope retirement and unmount retire the active request', () => {
    const gate = calendarRequestGate();
    const active = gate.next();
    gate.retire();
    expect(active()).toBe(false);
});

test('HTTP and malformed responses fail visibly instead of becoming an empty success', async () => {
    await expect(loadCalendarPages(async () => ({ status: 403, success: false, data: { message: 'Denied' } }), {})).rejects.toThrow('Denied');
    await expect(loadCalendarPages(async () => ({ status: 200, success: true, data: {} }), {})).rejects.toThrow('Invalid calendar response');
});

test('a later page failure does not produce a silently incomplete calendar', async () => {
    const read = jest.fn().mockResolvedValueOnce({ status: 200, data: { events: Array.from({ length: 500 }, (_, id) => ({ id })) } })
        .mockResolvedValueOnce({ status: 500, success: false, message: 'Unavailable' });
    await expect(loadCalendarPages(read, {})).rejects.toThrow('Unavailable');
});
