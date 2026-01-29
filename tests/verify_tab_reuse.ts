
import { applyTabGroups } from '../src/background/tabManager';
import { TabGroup, TabMetadata } from '../src/shared/types';

// Mock setup
const mockChrome = {
    tabs: {
        group: (opts: any) => Promise.resolve(opts.groupId ?? 999),
        ungroup: (ids: any) => Promise.resolve(),
        query: (opts: any) => Promise.resolve([] as any[]),
        move: (ids: any, opts: any) => Promise.resolve(),
        get: (id: number) => Promise.resolve({})
    },
    tabGroups: {
        update: (id: number, opts: any) => Promise.resolve(),
        query: (opts: any) => Promise.resolve([]),
        move: (id: number, opts: any) => Promise.resolve()
    },
    windows: {
        getAll: () => Promise.resolve([])
    },
    runtime: {
        id: 'test-id'
    },
    storage: {
        local: {
            get: (keys: any, cb: any) => cb({}),
            set: (items: any, cb: any) => cb && cb()
        }
    }
};
(global as any).chrome = mockChrome;

// Mock fetch for logger
(global as any).fetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({})
});

async function testReuse_Partial() {
    console.log("Running testReuse_Partial...");
    const tabs: any[] = [
        { id: 1, windowId: 1, groupId: 100, title: 'T1', url: '', pinned: false, active: false, index: 0 },
        { id: 2, windowId: 1, groupId: 100, title: 'T2', url: '', pinned: false, active: false, index: 1 }
    ];
    const group: any = {
        id: 'g1',
        windowId: 1,
        label: 'Test Group',
        color: 'blue',
        tabs: tabs,
        reason: 'test'
    };

    const calls: any[] = [];
    mockChrome.tabs.group = (opts: any) => {
        calls.push({ type: 'group', opts });
        return Promise.resolve(opts.groupId ?? 100);
    };
    mockChrome.tabGroups.update = (id: number, opts: any) => {
        calls.push({ type: 'update', id, opts });
        return Promise.resolve();
    };
    // Mock: Group 100 currently contains only Tab 1
    mockChrome.tabs.query = (opts: any) => {
        if (opts.groupId === 100) return Promise.resolve([{ id: 1, groupId: 100 }]);
        return Promise.resolve([]);
    }

    await applyTabGroups([group]);

    // Should only group Tab 2
    const groupCall = calls.find(c => c.type === 'group');
    if (groupCall && groupCall.opts.groupId === 100 && groupCall.opts.tabIds.length === 1 && groupCall.opts.tabIds[0] === 2) {
        console.log("PASS: Added only missing tab 2");
    } else {
        console.error("FAIL: Incorrect grouping call", groupCall);
        process.exit(1);
    }
}

async function testReuse_Full() {
    console.log("Running testReuse_Full...");
    const tabs: any[] = [
        { id: 1, windowId: 1, groupId: 100, title: 'T1', url: '', pinned: false, active: false, index: 0 }
    ];
    const group: any = {
        id: 'g1',
        windowId: 1,
        label: 'Test Group',
        color: 'blue',
        tabs: tabs,
        reason: 'test'
    };

    const calls: any[] = [];
    mockChrome.tabs.group = (opts: any) => {
        calls.push({ type: 'group', opts });
        return Promise.resolve(opts.groupId ?? 100);
    };
    // Mock: Group 100 already contains Tab 1
    mockChrome.tabs.query = (opts: any) => {
        if (opts.groupId === 100) return Promise.resolve([{ id: 1, groupId: 100 }]);
        return Promise.resolve([]);
    }
    mockChrome.tabGroups.update = (id: number, opts: any) => {
        return Promise.resolve();
    };

    await applyTabGroups([group]);

    // Should not call group
    const groupCall = calls.find(c => c.type === 'group');
    if (!groupCall) {
        console.log("PASS: No redundant group call");
    } else {
        console.error("FAIL: Redundant group call made", groupCall);
        process.exit(1);
    }
}

async function testUngroupLeftovers() {
    console.log("Running testUngroupLeftovers...");
     const tabs: any[] = [
        { id: 1, windowId: 1, groupId: 100, title: 'T1', url: '', pinned: false, active: false, index: 0 }
    ];
    const group: any = {
        id: 'g1',
        windowId: 1,
        label: 'Test Group',
        color: 'blue',
        tabs: tabs,
        reason: 'test'
    };

    const calls: any[] = [];
    mockChrome.tabs.group = (opts: any) => {
        calls.push({ type: 'group', opts });
        return Promise.resolve(opts.groupId ?? 100);
    };
    mockChrome.tabs.ungroup = (ids: any) => {
        calls.push({ type: 'ungroup', ids });
        return Promise.resolve();
    };
    mockChrome.tabs.query = (opts: any) => {
        if (opts.groupId === 100) return Promise.resolve([{ id: 1, groupId: 100 }, { id: 2, groupId: 100 }]);
        return Promise.resolve([]);
    }
    mockChrome.tabGroups.update = (id: number, opts: any) => {
         return Promise.resolve();
    };

    await applyTabGroups([group]);

    const ungroupCall = calls.find(c => c.type === 'ungroup');
    if (ungroupCall && ungroupCall.ids.includes(2)) {
         console.log("PASS: Ungrouped leftover tab 2");
    } else {
         console.error("FAIL: Did not ungroup tab 2", calls);
         process.exit(1);
    }
}

async function main() {
    try {
        await testReuse_Partial();
        await testReuse_Full();
        await testUngroupLeftovers();
        console.log("All tests passed");
    } catch (e) {
        console.error("Test failed with error:", e);
        process.exit(1);
    }
}

main();
