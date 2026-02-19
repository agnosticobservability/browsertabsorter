import { expect, test, describe, beforeAll, afterAll } from "bun:test";

// --- Mock Setup ---
const mockWindows = [
  {
    id: 101,
    tabs: [
      { id: 1001, url: "https://example.com/1", pinned: false, groupId: -1, active: true },
      { id: 1002, url: "https://example.com/2", pinned: true, groupId: -1, active: false }
    ]
  },
  {
    id: 102,
    tabs: [
      { id: 2001, url: "https://example.com/3", pinned: false, groupId: 1, active: false }
    ]
  },
  {
    id: 103 // Empty window, no tabs property (simulates populate: false or error case)
  }
];

const mockGroups = [
  { id: 1, title: "Test Group", color: "blue" }
];

const chromeMock = {
  windows: {
    getAll: async (opts?: any) => {
      if (opts?.populate) {
        return JSON.parse(JSON.stringify(mockWindows)); // deep copy to simulate fresh fetch
      }
      return mockWindows.map(w => ({ ...w, tabs: undefined }));
    }
  },
  tabGroups: {
    query: async (query?: any) => {
      return JSON.parse(JSON.stringify(mockGroups));
    },
    TAB_GROUP_ID_NONE: -1
  },
  tabs: {
    TAB_ID_NONE: -1
  },
  storage: {
    local: {
      get: (keys: any, callback: (items: any) => void) => {
        callback({}); // Return empty storage
      },
      set: (items: any, callback?: () => void) => {
        if (callback) callback();
      }
    }
  }
};

// Apply mock globally
(global as any).chrome = chromeMock;

// Import the module under test AFTER mocking
import { captureCurrentState } from "../src/background/stateManager.js";
import { UndoState } from "../src/shared/types.js";

describe("stateManager.ts - captureCurrentState", () => {

  test("Basic State Capture: Should capture windows and tabs correctly", async () => {
    const state: UndoState = await captureCurrentState();

    expect(state).toBeDefined();
    expect(state.timestamp).toBeGreaterThan(0);
    // Window 103 should be skipped because it has no tabs property in our mock
    expect(state.windows.length).toBe(2);

    // Window 101
    const win1 = state.windows.find(w => w.tabs.some(t => t.id === 1001));
    expect(win1).toBeDefined();
    expect(win1!.tabs.length).toBe(2);

    const tab1 = win1!.tabs.find(t => t.id === 1001);
    expect(tab1!.url).toBe("https://example.com/1");
    expect(tab1!.pinned).toBe(false);
    expect(tab1!.groupId).toBe(-1);

    const tab2 = win1!.tabs.find(t => t.id === 1002);
    expect(tab2!.url).toBe("https://example.com/2");
    expect(tab2!.pinned).toBe(true);
  });

  test("Capture with Groups: Should include group title and color", async () => {
    const state: UndoState = await captureCurrentState();

    // Window 102 has a grouped tab
    const win2 = state.windows.find(w => w.tabs.some(t => t.id === 2001));
    expect(win2).toBeDefined();
    expect(win2!.tabs.length).toBe(1);

    const groupedTab = win2!.tabs[0];
    expect(groupedTab.groupId).toBe(1);
    expect(groupedTab.groupTitle).toBe("Test Group");
    expect(groupedTab.groupColor).toBe("blue");
  });

  test("Window Filtering: Should skip windows without tabs property", async () => {
     // Based on our mockWindows setup, id: 103 has no tabs property.
     const state: UndoState = await captureCurrentState();

     // Verify that only windows with tabs (101 and 102) are captured.
     const capturedWindowIds = state.windows
        .flatMap(w => w.tabs.map(t => t.id)); // Assuming we can trace back or infer, but strictly we verify counts.

     // Since our result structure doesn't keep window IDs directly (WindowState has tabs[]),
     // we rely on tab IDs to identify windows.

     const allTabIds = state.windows.flatMap(w => w.tabs.map(t => t.id));
     expect(allTabIds).toContain(1001);
     expect(allTabIds).toContain(1002);
     expect(allTabIds).toContain(2001);
     expect(allTabIds.length).toBe(3);
  });

});
