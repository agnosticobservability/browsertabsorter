import { expect, test, describe, beforeEach } from "bun:test";

// Mock Chrome API
const chromeMock = {
    windows: {
        getAll: async () => [],
    },
    tabs: {
        query: async () => [],
        TAB_ID_NONE: -1
    },
    tabGroups: {
        query: async () => [],
        TAB_GROUP_ID_NONE: -1
    },
    storage: {
        local: {
            get: (key: string | string[], cb: (items: any) => void) => cb({}),
            set: (items: any, cb: () => void) => cb()
        },
        session: {
            get: (key: string | string[]) => Promise.resolve({}),
            set: (items: any) => Promise.resolve()
        }
    },
    runtime: {
        sendMessage: async () => {}
    }
};

(global as any).chrome = chromeMock;

// Import the module under test
import { captureCurrentState } from "../src/background/stateManager.js";

describe("stateManager - captureCurrentState", () => {
    beforeEach(() => {
        // Reset mocks to default behavior
        chromeMock.windows.getAll = async () => [];
        chromeMock.tabGroups.query = async () => [];
    });

    test("returns empty state when no windows exist", async () => {
        const state = await captureCurrentState();
        expect(state.windows).toEqual([]);
        expect(typeof state.timestamp).toBe("number");
    });

    test("captures basic window with tabs", async () => {
        const mockWindows = [
            {
                id: 1,
                tabs: [
                    { id: 101, url: "https://example.com", pinned: false, groupId: -1 }
                ]
            }
        ];
        chromeMock.windows.getAll = async () => mockWindows as any;

        const state = await captureCurrentState();
        expect(state.windows.length).toBe(1);
        expect(state.windows[0].tabs.length).toBe(1);
        expect(state.windows[0].tabs[0].url).toBe("https://example.com");
        expect(state.windows[0].tabs[0].groupId).toBe(-1);
    });

    test("captures group info for grouped tabs", async () => {
        const mockWindows = [
            {
                id: 1,
                tabs: [
                    { id: 101, url: "https://example.com", groupId: 1, pinned: false },
                    { id: 102, url: "https://google.com", groupId: -1, pinned: true }
                ]
            }
        ];
        const mockGroups = [
            { id: 1, title: "My Group", color: "blue" }
        ];

        chromeMock.windows.getAll = async () => mockWindows as any;
        chromeMock.tabGroups.query = async () => mockGroups as any;

        const state = await captureCurrentState();

        // Check grouped tab
        const groupedTab = state.windows[0].tabs[0];
        expect(groupedTab.groupId).toBe(1);
        expect(groupedTab.groupTitle).toBe("My Group");
        expect(groupedTab.groupColor).toBe("blue");

        // Check ungrouped tab
        const ungroupedTab = state.windows[0].tabs[1];
        expect(ungroupedTab.groupId).toBe(-1);
        expect(ungroupedTab.groupTitle).toBeUndefined();
        expect(ungroupedTab.groupColor).toBeUndefined();
        expect(ungroupedTab.pinned).toBe(true);
    });

    test("handles tabs in multiple windows", async () => {
        const mockWindows = [
            {
                id: 1,
                tabs: [{ id: 101, groupId: -1 }]
            },
            {
                id: 2,
                tabs: [{ id: 201, groupId: -1 }]
            }
        ];
        chromeMock.windows.getAll = async () => mockWindows as any;

        const state = await captureCurrentState();
        expect(state.windows.length).toBe(2);
        expect(state.windows[0].tabs[0].id).toBe(101);
        expect(state.windows[1].tabs[0].id).toBe(201);
    });

    test("handles window without tabs property gracefully", async () => {
        const mockWindows = [
            { id: 1 } // No tabs property
        ];
        chromeMock.windows.getAll = async () => mockWindows as any;

        const state = await captureCurrentState();
        expect(state.windows.length).toBe(0);
    });
});
