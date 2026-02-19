import { describe, expect, test, beforeEach, mock } from "bun:test";

// Mock chrome global
const mockChrome = {
  tabs: {
    query: mock(),
    move: mock(),
    get: mock(),
    group: mock(),
    ungroup: mock(),
    remove: mock(),
  },
  windows: {
    create: mock(),
  },
  tabGroups: {
    query: mock(),
    update: mock(),
    move: mock(),
  },
};

global.chrome = mockChrome as any;

// Import the module under test
import { splitTabs } from "../src/background/tabManager";

describe("splitTabs", () => {
  beforeEach(() => {
    mockChrome.tabs.query.mockClear();
    mockChrome.tabs.move.mockClear();
    mockChrome.windows.create.mockClear();

    // Default implementation: return empty array
    mockChrome.tabs.query.mockResolvedValue([]);
  });

  test("should return early if tabIds is empty", async () => {
    await splitTabs([]);
    expect(mockChrome.tabs.query).not.toHaveBeenCalled();
    expect(mockChrome.windows.create).not.toHaveBeenCalled();
  });

  test("should return early if no valid tabs found", async () => {
    // Mock query to return no tabs matching the IDs
    mockChrome.tabs.query.mockResolvedValue([
        { id: 999, windowId: 1 } // Unrelated tab
    ]);

    await splitTabs([1, 2]);

    expect(mockChrome.tabs.query).toHaveBeenCalled();
    expect(mockChrome.windows.create).not.toHaveBeenCalled();
  });

  test("should create new window for single tab", async () => {
    const tab1 = { id: 1, windowId: 10, index: 0 };
    mockChrome.tabs.query.mockResolvedValue([tab1]);
    mockChrome.windows.create.mockResolvedValue({ id: 99 });

    await splitTabs([1]);

    expect(mockChrome.tabs.query).toHaveBeenCalled();
    expect(mockChrome.windows.create).toHaveBeenCalledWith({ tabId: 1 });
    expect(mockChrome.tabs.move).not.toHaveBeenCalled();
  });

  test("should create new window and move remaining tabs", async () => {
    const tab1 = { id: 1, windowId: 10, index: 0 };
    const tab2 = { id: 2, windowId: 10, index: 1 };
    const tab3 = { id: 3, windowId: 10, index: 2 };

    // query returns all tabs available in browser
    mockChrome.tabs.query.mockResolvedValue([tab1, tab2, tab3]);
    mockChrome.windows.create.mockResolvedValue({ id: 99 });
    mockChrome.tabs.move.mockResolvedValue([]);

    await splitTabs([1, 2, 3]);

    expect(mockChrome.windows.create).toHaveBeenCalledWith({ tabId: 1 });
    // The implementation moves remaining tabs (2, 3) to the new window
    expect(mockChrome.tabs.move).toHaveBeenCalledWith([2, 3], { windowId: 99, index: -1 });
  });
});
