"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tabManager_1 = require("../src/background/tabManager");
// Mock setup
const mockChrome = {
    tabs: {
        group: (opts) => Promise.resolve(opts.groupId ?? 999),
        ungroup: (ids) => Promise.resolve(),
        query: (opts) => Promise.resolve([]),
        move: (ids, opts) => Promise.resolve(),
        get: (id) => Promise.resolve({})
    },
    tabGroups: {
        update: (id, opts) => Promise.resolve(),
        query: (opts) => Promise.resolve([]),
        move: (id, opts) => Promise.resolve()
    },
    windows: {
        getAll: () => Promise.resolve([])
    },
    runtime: {
        id: 'test-id'
    },
    storage: {
        local: {
            get: (keys, cb) => cb({}),
            set: (items, cb) => cb && cb()
        }
    }
};
global.chrome = mockChrome;
// Mock fetch for logger
global.fetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({})
});
async function testReuse_Partial() {
    console.log("Running testReuse_Partial...");
    const tabs = [
        { id: 1, windowId: 1, groupId: 100, title: 'T1', url: '', pinned: false, active: false, index: 0 },
        { id: 2, windowId: 1, groupId: 100, title: 'T2', url: '', pinned: false, active: false, index: 1 }
    ];
    const group = {
        id: 'g1',
        windowId: 1,
        label: 'Test Group',
        color: 'blue',
        tabs: tabs,
        reason: 'test'
    };
    const calls = [];
    mockChrome.tabs.group = (opts) => {
        calls.push({ type: 'group', opts });
        return Promise.resolve(opts.groupId ?? 100);
    };
    mockChrome.tabGroups.update = (id, opts) => {
        calls.push({ type: 'update', id, opts });
        return Promise.resolve();
    };
    // Mock: Group 100 currently contains only Tab 1
    mockChrome.tabs.query = (opts) => {
        if (opts.groupId === 100)
            return Promise.resolve([{ id: 1, groupId: 100 }]);
        return Promise.resolve([]);
    };
    await (0, tabManager_1.applyTabGroups)([group]);
    // Should only group Tab 2
    const groupCall = calls.find(c => c.type === 'group');
    if (groupCall && groupCall.opts.groupId === 100 && groupCall.opts.tabIds.length === 1 && groupCall.opts.tabIds[0] === 2) {
        console.log("PASS: Added only missing tab 2");
    }
    else {
        console.error("FAIL: Incorrect grouping call", groupCall);
        process.exit(1);
    }
}
async function testReuse_Full() {
    console.log("Running testReuse_Full...");
    const tabs = [
        { id: 1, windowId: 1, groupId: 100, title: 'T1', url: '', pinned: false, active: false, index: 0 }
    ];
    const group = {
        id: 'g1',
        windowId: 1,
        label: 'Test Group',
        color: 'blue',
        tabs: tabs,
        reason: 'test'
    };
    const calls = [];
    mockChrome.tabs.group = (opts) => {
        calls.push({ type: 'group', opts });
        return Promise.resolve(opts.groupId ?? 100);
    };
    // Mock: Group 100 already contains Tab 1
    mockChrome.tabs.query = (opts) => {
        if (opts.groupId === 100)
            return Promise.resolve([{ id: 1, groupId: 100 }]);
        return Promise.resolve([]);
    };
    mockChrome.tabGroups.update = (id, opts) => {
        return Promise.resolve();
    };
    await (0, tabManager_1.applyTabGroups)([group]);
    // Should not call group
    const groupCall = calls.find(c => c.type === 'group');
    if (!groupCall) {
        console.log("PASS: No redundant group call");
    }
    else {
        console.error("FAIL: Redundant group call made", groupCall);
        process.exit(1);
    }
}
async function testUngroupLeftovers() {
    console.log("Running testUngroupLeftovers...");
    const tabs = [
        { id: 1, windowId: 1, groupId: 100, title: 'T1', url: '', pinned: false, active: false, index: 0 }
    ];
    const group = {
        id: 'g1',
        windowId: 1,
        label: 'Test Group',
        color: 'blue',
        tabs: tabs,
        reason: 'test'
    };
    const calls = [];
    mockChrome.tabs.group = (opts) => {
        calls.push({ type: 'group', opts });
        return Promise.resolve(opts.groupId ?? 100);
    };
    mockChrome.tabs.ungroup = (ids) => {
        calls.push({ type: 'ungroup', ids });
        return Promise.resolve();
    };
    mockChrome.tabs.query = (opts) => {
        if (opts.groupId === 100)
            return Promise.resolve([{ id: 1, groupId: 100 }, { id: 2, groupId: 100 }]);
        return Promise.resolve([]);
    };
    mockChrome.tabGroups.update = (id, opts) => {
        return Promise.resolve();
    };
    await (0, tabManager_1.applyTabGroups)([group]);
    const ungroupCall = calls.find(c => c.type === 'ungroup');
    if (ungroupCall && ungroupCall.ids.includes(2)) {
        console.log("PASS: Ungrouped leftover tab 2");
    }
    else {
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
    }
    catch (e) {
        console.error("Test failed with error:", e);
        process.exit(1);
    }
}
main();
