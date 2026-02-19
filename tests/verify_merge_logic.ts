
import { mergeTabs, splitTabs } from '../src/background/tabManager';

// Mock setup
const mockTabs = new Map<number, any>();
const mockGroups = new Map<number, any>();

const mockChrome = {
    tabs: {
        query: (opts: any) => {
            // Return all tabs for {} query
            if (Object.keys(opts).length === 0) {
                return Promise.resolve(Array.from(mockTabs.values()));
            }
            return Promise.resolve([]);
        },
        move: (ids: any, opts: any) => {
            const idList = Array.isArray(ids) ? ids : [ids];
            idList.forEach(id => {
                const t = mockTabs.get(id);
                if (t) {
                    t.windowId = opts.windowId ?? t.windowId;
                    t.index = opts.index ?? t.index;
                }
            });
            return Promise.resolve(idList.map(id => mockTabs.get(id)));
        },
        group: (opts: any) => {
            const groupId = opts.groupId ?? 999;
            const tabIds = opts.tabIds || [];
            tabIds.forEach((id: number) => {
                const t = mockTabs.get(id);
                if (t) t.groupId = groupId;
            });
            return Promise.resolve(groupId);
        },
        get: (id: number) => {
             const t = mockTabs.get(id);
             return t ? Promise.resolve({...t}) : Promise.reject("Not found");
        },
        remove: (ids: any) => Promise.resolve()
    },
    windows: {
        create: (opts: any) => {
            const newWinId = 100 + Math.floor(Math.random() * 100);
            if (opts.tabId) {
                const t = mockTabs.get(opts.tabId);
                if (t) t.windowId = newWinId;
            }
            return Promise.resolve({ id: newWinId });
        }
    },
    tabGroups: {
        query: () => Promise.resolve([]),
        update: () => Promise.resolve()
    }
};

(global as any).chrome = mockChrome;

// Mocks for imports
(global as any).fetch = () => Promise.resolve({ ok: true, json: () => ({}) });

// Helper to reset state
function resetMocks() {
    mockTabs.clear();
    mockGroups.clear();
}

async function testMergeTabs_Basic() {
    resetMocks();
    console.log("Running testMergeTabs_Basic...");

    // Setup 2 tabs in different windows
    mockTabs.set(1, { id: 1, windowId: 10, index: 0, groupId: -1 });
    mockTabs.set(2, { id: 2, windowId: 20, index: 0, groupId: -1 });

    // Merge them. Order: [1, 2]. Target should be Window 10 (from tab 1).
    await mergeTabs([1, 2]);

    const t1 = mockTabs.get(1);
    const t2 = mockTabs.get(2);

    if (t1.windowId === 10 && t2.windowId === 10) {
        console.log("PASS: Both tabs in Window 10");
    } else {
        console.error(`FAIL: Window IDs incorrect. T1:${t1.windowId}, T2:${t2.windowId}`);
        process.exit(1);
    }

    if (t1.groupId === 999 && t2.groupId === 999) {
        console.log("PASS: Both tabs grouped");
    } else {
        console.error(`FAIL: Group IDs incorrect. T1:${t1.groupId}, T2:${t2.groupId}`);
        process.exit(1);
    }
}

async function testMergeTabs_Order() {
    resetMocks();
    console.log("Running testMergeTabs_Order...");

    // Setup 2 tabs in different windows
    mockTabs.set(1, { id: 1, windowId: 10, index: 0, groupId: -1 });
    mockTabs.set(2, { id: 2, windowId: 20, index: 0, groupId: -1 });

    // Merge them. Order: [2, 1]. Target should be Window 20 (from tab 2).
    await mergeTabs([2, 1]);

    const t1 = mockTabs.get(1);
    const t2 = mockTabs.get(2);

    if (t1.windowId === 20 && t2.windowId === 20) {
        console.log("PASS: Both tabs in Window 20");
    } else {
        console.error(`FAIL: Window IDs incorrect. T1:${t1.windowId}, T2:${t2.windowId}`);
        process.exit(1);
    }
}

async function testMergeTabs_Missing() {
    resetMocks();
    console.log("Running testMergeTabs_Missing...");

    mockTabs.set(1, { id: 1, windowId: 10, index: 0, groupId: -1 });

    // Merge existing 1 and missing 99.
    await mergeTabs([1, 99]);

    const t1 = mockTabs.get(1);
    // Should proceed with valid tabs. Since only 1 valid tab,
    // validTabs=[t1].
    // Target window 10.
    // Tabs to move: [].
    // Group:
    // It calls group with [1].

    if (t1.groupId === 999) {
        console.log("PASS: Valid tab grouped");
    } else {
        console.error("FAIL: Valid tab not grouped");
        process.exit(1);
    }
}

async function testSplitTabs() {
    resetMocks();
    console.log("Running testSplitTabs...");

    mockTabs.set(1, { id: 1, windowId: 10, index: 0 });
    mockTabs.set(2, { id: 2, windowId: 10, index: 1 });
    mockTabs.set(3, { id: 3, windowId: 10, index: 2 });

    await splitTabs([1, 2, 3]);

    const t1 = mockTabs.get(1);
    const t2 = mockTabs.get(2);
    const t3 = mockTabs.get(3);

    // T1 should be in new window (e.g. 100+)
    const newWinId = t1.windowId;
    if (newWinId > 100) {
        console.log(`PASS: Tab 1 moved to new window ${newWinId}`);
    } else {
        console.error(`FAIL: Tab 1 not in new window. WinId: ${t1.windowId}`);
        process.exit(1);
    }

    if (t2.windowId === newWinId && t3.windowId === newWinId) {
        console.log("PASS: Remaining tabs moved to new window");
    } else {
        console.error("FAIL: Remaining tabs not moved");
        process.exit(1);
    }
}

async function main() {
    try {
        await testMergeTabs_Basic();
        await testMergeTabs_Order();
        await testMergeTabs_Missing();
        await testSplitTabs();
        console.log("All verify tests passed");
    } catch (e) {
        console.error("Test execution failed:", e);
        process.exit(1);
    }
}

main();
