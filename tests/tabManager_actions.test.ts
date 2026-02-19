import { expect, test, mock, beforeEach, afterEach, describe } from "bun:test";

// Mocks
const queryMock = mock(async () => []);
const getMock = mock(async () => ({}));
const moveMock = mock(async () => []);
const groupMock = mock(async () => 0);
const removeMock = mock(async () => {});
const ungroupMock = mock(async () => {});
const windowsCreateMock = mock(async () => ({ id: 999 }));
const tabGroupsQueryMock = mock(async () => []);
const tabGroupsUpdateMock = mock(async () => {});

global.chrome = {
  tabs: {
    query: queryMock,
    get: getMock,
    move: moveMock,
    group: groupMock,
    remove: removeMock,
    ungroup: ungroupMock,
    TAB_ID_NONE: -1
  },
  windows: {
    create: windowsCreateMock
  },
  tabGroups: {
    query: tabGroupsQueryMock,
    update: tabGroupsUpdateMock,
    move: mock(async () => {})
  },
  storage: {
    local: {
      get: () => {},
      set: () => {}
    }
  }
} as any;

import { mergeTabs } from "../src/background/tabManager";

describe("mergeTabs", () => {
    beforeEach(() => {
        queryMock.mockClear();
        getMock.mockClear();
        moveMock.mockClear();
        groupMock.mockClear();
        removeMock.mockClear();
        ungroupMock.mockClear();
        windowsCreateMock.mockClear();
        tabGroupsQueryMock.mockClear();
        tabGroupsUpdateMock.mockClear();

        // Default: return empty list for query
        queryMock.mockResolvedValue([]);
    });

    test("should do nothing if tabIds is empty", async () => {
        await mergeTabs([]);
        expect(queryMock).not.toHaveBeenCalled();
        expect(moveMock).not.toHaveBeenCalled();
        expect(groupMock).not.toHaveBeenCalled();
    });

    test("should do nothing if no valid tabs found", async () => {
        queryMock.mockResolvedValue([]); // No tabs in browser
        await mergeTabs([1, 2]);
        expect(moveMock).not.toHaveBeenCalled();
        expect(groupMock).not.toHaveBeenCalled();
    });

    test("should merge two ungrouped tabs from different windows", async () => {
        // Setup: Tab 1 in Window 10, Tab 2 in Window 20.
        // Expect: Tab 2 moved to Window 10. Both grouped.
        const tabs = [
            { id: 1, windowId: 10, index: 0, groupId: -1 },
            { id: 2, windowId: 20, index: 0, groupId: -1 }
        ];
        queryMock.mockResolvedValue(tabs);
        groupMock.mockResolvedValue(100); // New group ID

        await mergeTabs([1, 2]);

        // 1. Verify getTabsByIds called query
        expect(queryMock).toHaveBeenCalled();

        // 2. Verify move: Tab 2 moved to Window 10
        expect(moveMock).toHaveBeenCalledTimes(1);
        expect(moveMock).toHaveBeenCalledWith([2], { windowId: 10, index: -1 });

        // 3. Verify group: Both tabs grouped. No existing group, so new group created.
        expect(groupMock).toHaveBeenCalledTimes(1);
        expect(groupMock).toHaveBeenCalledWith({ tabIds: [1, 2], groupId: undefined });
    });

    test("should merge tabs into the first tab's window (Target Window Logic)", async () => {
        // Setup: Tab 1 (Window 10), Tab 2 (Window 20), Tab 3 (Window 30)
        // Order in input: [2, 1, 3]
        // Target should be Window 20 (because Tab 2 is first in input list)
        const tabs = [
            { id: 1, windowId: 10, index: 0, groupId: -1 },
            { id: 2, windowId: 20, index: 0, groupId: -1 },
            { id: 3, windowId: 30, index: 0, groupId: -1 }
        ];
        queryMock.mockResolvedValue(tabs);

        await mergeTabs([2, 1, 3]);

        // Move calls: Tab 1 -> Window 20, Tab 3 -> Window 20
        // Expect move to be called with [1, 3] to Window 20
        expect(moveMock).toHaveBeenCalledWith([1, 3], { windowId: 20, index: -1 });

        // Group calls: All 3 tabs grouped
        expect(groupMock).toHaveBeenCalledWith({ tabIds: [2, 1, 3], groupId: undefined });
    });

    test("should merge into an existing group if the first tab is already grouped", async () => {
        // Setup: Tab 1 (Group 50, Window 10), Tab 2 (Ungrouped, Window 20)
        // Expect: Tab 2 moved to Window 10. Grouped into Group 50.
        const tabs = [
            { id: 1, windowId: 10, index: 0, groupId: 50 },
            { id: 2, windowId: 20, index: 0, groupId: -1 }
        ];
        queryMock.mockResolvedValue(tabs);

        await mergeTabs([1, 2]);

        expect(moveMock).toHaveBeenCalledWith([2], { windowId: 10, index: -1 });
        expect(groupMock).toHaveBeenCalledWith({ tabIds: [1, 2], groupId: 50 });
    });

    test("should merge into an existing group if another tab in target window is grouped (First tab ungrouped)", async () => {
        // Setup: Tab 1 (Ungrouped, Window 10), Tab 2 (Group 60, Window 10)
        // Target Window: 10
        // Expect: Grouped into Group 60.
        const tabs = [
            { id: 1, windowId: 10, index: 0, groupId: -1 },
            { id: 2, windowId: 10, index: 1, groupId: 60 }
        ];
        queryMock.mockResolvedValue(tabs);

        await mergeTabs([1, 2]);

        expect(moveMock).not.toHaveBeenCalled(); // Already in same window
        expect(groupMock).toHaveBeenCalledWith({ tabIds: [1, 2], groupId: 60 });
    });

    test("should handle missing/invalid tabs gracefully", async () => {
        // Setup: Tab 1 exists. Tab 99 does not.
        const tabs = [
            { id: 1, windowId: 10, index: 0, groupId: -1 }
        ];
        queryMock.mockResolvedValue(tabs);

        await mergeTabs([1, 99]);

        // Should operate only on Tab 1
        // move not called (already in target)
        // group called with [1]
        expect(groupMock).toHaveBeenCalledWith({ tabIds: [1], groupId: undefined });
    });

    test("should prioritize first tab's group over others", async () => {
        // Setup: Tab 1 (Group 100, Window 10), Tab 2 (Group 200, Window 10)
        // Expect: Merge into Group 100.
        const tabs = [
            { id: 1, windowId: 10, index: 0, groupId: 100 },
            { id: 2, windowId: 10, index: 1, groupId: 200 }
        ];
        queryMock.mockResolvedValue(tabs);

        await mergeTabs([1, 2]);

        expect(groupMock).toHaveBeenCalledWith({ tabIds: [1, 2], groupId: 100 });
    });
});
