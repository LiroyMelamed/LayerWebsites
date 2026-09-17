import { filterTodayActivityByActor } from "./managerHomeDrillDownUtils";

describe("filterTodayActivityByActor", () => {
    const log = [
        { activityType: "stage_update", actorId: 1017, managerId: 2001, caseName: "A" },
        { activityType: "stage_update", actorId: 1017, managerId: 2001, caseName: "B" },
        { activityType: "stage_update", actorId: 1017, managerId: 2002, caseName: "C" },
        { activityType: "stage_update", actorId: 1017, managerId: 2002, caseName: "D" },
        { activityType: "stage_update", actorId: 3003, managerId: 2001, caseName: "E" },
    ];

    it("returns actions performed by the actor, not the assigned case manager", () => {
        const items = filterTodayActivityByActor(log, 1017);
        expect(items).toHaveLength(4);
        expect(items.every((entry) => entry.actorId === 1017)).toBe(true);
    });

    it("returns empty when filtering by case manager id instead of actor id (old bug)", () => {
        const actorId = 1017;
        const oldBugItems = log.filter((entry) => String(entry.managerId) === String(actorId));
        const fixedItems = filterTodayActivityByActor(log, actorId);
        expect(oldBugItems).toHaveLength(0);
        expect(fixedItems).toHaveLength(4);
    });

    it("returns all entries when actorId is omitted", () => {
        expect(filterTodayActivityByActor(log, null)).toHaveLength(5);
        expect(filterTodayActivityByActor(log, "")).toHaveLength(5);
    });

    it("handles non-array log safely", () => {
        expect(filterTodayActivityByActor(undefined, 1017)).toEqual([]);
    });
});
