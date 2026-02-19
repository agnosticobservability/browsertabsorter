
import { expect, test, describe, beforeEach, mock } from "bun:test";
import { restoreState } from "../src/background/stateManager";

// Mock Chrome API
const movedTabs: any[] = [];
const pinnedTabs: any[] = [];

const chromeMock = {
    windows: {
        getAll: async () => [{ id: 1, tabs: [] }],
        create: async () => ({ id: 2, tabs: [] }),
    },
    tabs: {
        query: async () => [],
        create: async (props: any) => ({ id: Math.floor(Math.random() * 10000) + 1000, ...props }),
        move: async (tabId: number | number[], moveProps: any) => {
            if (Array.isArray(tabId)) {
                tabId.forEach(id => movedTabs.push({ id, ...moveProps }));
                return tabId.map(id => ({ id, ...moveProps }));
            }
            movedTabs.push({ id: tabId, ...moveProps });
            return { id: tabId, ...moveProps };
        },
        update: async (tabId: number, updateProps: any) => {
             if (updateProps.pinned !== undefined) {
                 pinnedTabs.push({ id: tabId, pinned: updateProps.pinned });
             }
             return { id: tabId, ...updateProps };
        },
        get: async (tabId: number) => ({ id: tabId, pinned: false }),
        ungroup: async () => {},
        group: async () => 100,
        TAB_ID_NONE: -1
    },
    tabGroups: {
        update: async () => {},
        TAB_GROUP_ID_NONE: -1
    },
    storage: {
        local: {
            get: (key: string | string[], cb: (items: any) => void) => cb({}),
            set: (items: any, cb: () => void) => cb()
        },
        session: {
            get: () => Promise.resolve({}),
            set: () => Promise.resolve()
        }
    },
    runtime: {
        sendMessage: async () => {}
    }
};

(global as any).chrome = chromeMock;

describe("restoreState Correctness", () => {
    beforeEach(() => {
        movedTabs.length = 0;
        pinnedTabs.length = 0;
    });

    test("restores tabs to correct window with batching", async () => {
        const state = {
            timestamp: Date.now(),
            windows: [{
                tabs: [
                    { id: undefined, url: "https://example.com/1", pinned: false, groupId: -1 },
                    { id: undefined, url: "https://example.com/2", pinned: true, groupId: -1 }
                ]
            }]
        };

        await restoreState(state);

        // Check if tabs were moved
        // We expect one batch move or individual moves. With optimization, one batch move.
        // The mock records individual entries if array is passed?
        // My mock: tabId.forEach(id => movedTabs.push({ id, ...moveProps }));

        expect(movedTabs.length).toBe(2);
        expect(movedTabs[0].windowId).toBe(1);
        expect(movedTabs[0].index).toBe(0); // Batch move uses index 0
        expect(movedTabs[1].windowId).toBe(1);
        expect(movedTabs[1].index).toBe(0);

        // Check pinning
        expect(pinnedTabs.length).toBe(1);
        expect(pinnedTabs[0].pinned).toBe(true);
    });
});
