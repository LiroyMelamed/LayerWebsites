/** Match firmStats.mostActiveManager (actor-based count) to todayActivityLog rows. */
export function filterTodayActivityByActor(log, actorId) {
    const entries = Array.isArray(log) ? log : [];
    if (actorId == null || actorId === "") return entries;
    return entries.filter((entry) => String(entry.actorId) === String(actorId));
}
