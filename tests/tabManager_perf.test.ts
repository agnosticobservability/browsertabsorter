import { expect, test, mock, spyOn, beforeAll, afterAll } from "bun:test";

// Mock global chrome
const queryMock = mock(() => Promise.resolve([]));
const getMock = mock(() => Promise.resolve({}));
const tabGroupsQueryMock = mock(() => Promise.resolve([]));
const tabGroupsUpdateMock = mock(() => Promise.resolve({}));
const tabGroupsMoveMock = mock(() => Promise.resolve({}));
const tabsMoveMock = mock(() => Promise.resolve({}));

global.chrome = {
  tabs: {
    query: queryMock,
    get: getMock,
    move: tabsMoveMock,
    TAB_ID_NONE: -1
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
  },
  windows: {
      create: () => Promise.resolve({ id: 999 })
  }
} as any;

// Import after mocking
import { calculateTabGroups, applyTabSorting } from "../src/background/tabManager.ts";
import { GroupingSelection, Preferences } from "../src/shared/types.ts";

const mockPreferences: Preferences = {
    sorting: [],
    debug: false,
};

test("calculateTabGroups calls chrome.tabs.query({}) when no filter provided", async () => {
    queryMock.mockClear();
    queryMock.mockResolvedValue([]);

    await calculateTabGroups(mockPreferences, {});

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledWith({});
});

test("calculateTabGroups calls chrome.tabs.query({ windowId }) when windowIds provided", async () => {
    queryMock.mockClear();
    queryMock.mockResolvedValue([]);

    const filter: GroupingSelection = { windowIds: [123] };
    await calculateTabGroups(mockPreferences, filter);

    // With optimization, this should be called with { windowId: 123 }
    // Currently it's called with {}, so this test is expected to fail or pass depending on implementation.
    // Since I haven't implemented it yet, I expect it to FAIL if I assert optimization,
    // or PASS if I assert current behavior.
    // I want to verify the optimization, so I will assert the DESIRED behavior.

    expect(queryMock).toHaveBeenCalledWith({ windowId: 123 });
});

test("applyTabSorting calls chrome.tabs.query({ windowId }) when windowIds provided", async () => {
    queryMock.mockClear();
    queryMock.mockResolvedValue([
        { id: 1, windowId: 123, index: 0, groupId: -1 },
        { id: 2, windowId: 123, index: 1, groupId: -1 }
    ]);

    const filter: GroupingSelection = { windowIds: [123] };
    await applyTabSorting(mockPreferences, filter);

    expect(queryMock).toHaveBeenCalledWith({ windowId: 123 });
});
