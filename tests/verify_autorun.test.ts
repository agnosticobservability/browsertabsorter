import { expect, test, mock, beforeEach, describe } from "bun:test";

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
const tabGroupsMoveMock = mock(async () => {});

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
    move: tabGroupsMoveMock
  },
  storage: {
    local: {
      get: () => {},
      set: () => {}
    }
  }
} as any;

import { applyTabGroups } from "../src/background/tabManager";
import { TabGroup } from "../src/shared/types";

describe("applyTabGroups Fallback Logic", () => {
    beforeEach(() => {
        queryMock.mockClear();
        groupMock.mockClear();
        tabGroupsQueryMock.mockClear();
        tabGroupsUpdateMock.mockClear();
        // Default query mock to return empty list
        queryMock.mockResolvedValue([]);
    });

    test("should merge into existing group by label if no group ID is found from tabs", async () => {
        // Setup:
        // We have a new tab (ID 10) that we want to put into group "Google".
        // There is an existing group "Google" (ID 100) in the window (ID 1).
        // The new tab is currently ungrouped (groupId -1).

        const newTab = {
            id: 10,
            windowId: 1,
            title: "Google Search",
            url: "https://google.com",
            pinned: false,
            active: true,
            index: 5,
            groupId: -1
        };

        const targetGroup: TabGroup = {
            id: "group-google",
            windowId: 1,
            label: "Google",
            color: "blue",
            tabs: [newTab],
            reason: "Domain",
            windowMode: "current"
        };

        // Mock existing groups in window 1
        tabGroupsQueryMock.mockResolvedValue([
            { id: 100, title: "Google", color: "blue", windowId: 1 },
            { id: 200, title: "Other", color: "red", windowId: 1 }
        ]);

        // Mock existing tabs in the target group
        queryMock.mockImplementation(async (arg: any) => {
             if (arg && arg.groupId === 100) {
                 return [{ id: 5, groupId: 100, windowId: 1 }];
             }
             return [];
        });

        await applyTabGroups([targetGroup]);

        // Verification:
        // 1. It should have queried groups in window 1.
        expect(tabGroupsQueryMock).toHaveBeenCalledWith({ windowId: 1 });

        // 2. It should have found group 100 as candidate because titles match ("Google").
        // 3. It should have called chrome.tabs.group with groupId: 100 and tabIds: [10].
        // Note: applyTabGroups filters tabs to add. Existing tabs in group are NOT added.
        expect(groupMock).toHaveBeenCalledWith({ groupId: 100, tabIds: [10] });

        // 4. It should update the group (title/color)
        expect(tabGroupsUpdateMock).toHaveBeenCalledWith(100, expect.any(Object));
    });

    test("should create new group if no matching title found", async () => {
         const newTab = {
            id: 11,
            windowId: 1,
            title: "Yahoo",
            url: "https://yahoo.com",
            pinned: false,
            active: true,
            index: 6,
            groupId: -1
        };

        const targetGroup: TabGroup = {
            id: "group-yahoo",
            windowId: 1,
            label: "Yahoo",
            color: "red",
            tabs: [newTab],
            reason: "Domain",
            windowMode: "current"
        };

        // No matching groups
        tabGroupsQueryMock.mockResolvedValue([
            { id: 100, title: "Google", color: "blue", windowId: 1 }
        ]);

        // Mock creation of new group
        groupMock.mockResolvedValue(300);

        await applyTabGroups([targetGroup]);

        // Should NOT have called group with existing ID
        expect(groupMock).not.toHaveBeenCalledWith(expect.objectContaining({ groupId: 100 }));

        // Should have called group with NEW group creation
        expect(groupMock).toHaveBeenCalledWith({
            tabIds: [11],
            createProperties: { windowId: 1 }
        });

        // And verify update called for new group 300
        expect(tabGroupsUpdateMock).toHaveBeenCalledWith(300, expect.any(Object));
    });
});
