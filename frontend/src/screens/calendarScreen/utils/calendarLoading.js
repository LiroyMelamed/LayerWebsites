/** Keep busy offices complete: the list endpoint returns paginated results. */
export async function loadCalendarPages(listEvents, params, isCurrent = () => true) {
    const events = new Map();
    const limit = 500;
    for (let offset = 0; offset < 50000; offset += limit) {
        const response = await listEvents({ ...params, limit, offset });
        if (!isCurrent()) return null;
        if (!response?.success && response?.status !== 200) {
            throw new Error(response?.data?.message || response?.message || 'Calendar request failed');
        }
        const page = response?.data?.events;
        if (!Array.isArray(page)) throw new Error('Invalid calendar response');
        page.forEach((event) => events.set(String(event.id), event));
        if (page.length < limit) return [...events.values()];
    }
    throw new Error('Calendar result limit exceeded');
}

/** A navigation/filter change retires both successful and failed older reads. */
export function calendarRequestGate() {
    let revision = 0;
    return {
        next() { const current = ++revision; return () => current === revision; },
        retire() { revision += 1; },
    };
}
