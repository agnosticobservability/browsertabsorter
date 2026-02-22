import { describe, test, expect, mock, beforeEach } from "bun:test";
import { fetchCurrentTabGroups, calculateTabGroups } from "../src/background/tabManager";
import { Preferences, TabMetadata } from "../src/shared/types";

// Mock chrome API
const mockTabs: any[] = [
    { id: 1, windowId: 1, title: "Tab 1", url: "https://example.com", pinned: false, index: 0, active: false, highlighted: false, groupId: -1 },
    { id: 2, windowId: 1, title: "Tab 2", url: "https://google.com", pinned: false, index: 1, active: true, highlighted: true, groupId: 101 }
];
const mockGroups: any[] = [
    { id: 101, windowId: 1, title: "Group 1", color: "blue" }
];

global.chrome = {
    tabs: {
        query: mock(() => Promise.resolve(mockTabs)),
        get: mock((id) => Promise.resolve(mockTabs.find(t => t.id === id))),
    },
    tabGroups: {
        query: mock(() => Promise.resolve(mockGroups)),
    },
    runtime: {
        lastError: null
    },
    storage: {
        local: {
            get: mock((keys, cb) => cb({})),
            set: mock(() => {})
        }
    }
} as any;

describe("Serialization Safety", () => {
    test("fetchCurrentTabGroups should return JSON-safe data", async () => {
        const prefs: Preferences = { sorting: [], debug: false };
        const groups = await fetchCurrentTabGroups(prefs);

        // Verify it's serializable (should not throw)
        const stringified = JSON.stringify(groups);
        expect(stringified).toBeDefined();

        // Check structure
        expect(Array.isArray(groups)).toBe(true);
        expect(groups.length).toBeGreaterThan(0);
    });

    test("calculateTabGroups should return JSON-safe data", async () => {
        const prefs: Preferences = { sorting: [], debug: false };
        const groups = await calculateTabGroups(prefs);
         const stringified = JSON.stringify(groups);
         expect(stringified).toBeDefined();
         expect(Array.isArray(groups)).toBe(true);
    });
});
