"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const groupingStrategies_js_1 = require("../src/background/groupingStrategies.js");
const tabManager_js_1 = require("../src/background/tabManager.js");
const assert_1 = __importDefault(require("assert"));
// Mock Chrome API
const chromeMock = {
    tabs: {
        query: async (info) => [],
        group: async (opts) => 1,
        ungroup: async (ids) => { },
        move: async (ids, props) => { },
        update: async (id, props) => { },
        remove: async (ids) => { },
        get: async (id) => ({})
    },
    tabGroups: {
        query: async (info) => [],
        update: async (id, props) => { },
        move: async (id, props) => { }
    },
    windows: {
        create: async (data) => ({ id: 999 }),
        update: async (id, props) => { }
    },
    storage: {
        local: {
            get: async () => ({}),
            set: async () => { }
        }
    }
};
global.chrome = chromeMock;
global.fetch = async () => ({ ok: true, json: async () => ({}) });
const mockTabs = [
    { id: 101, windowId: 1, title: "Google Search", url: "https://google.com", pinned: false, index: 0, active: false },
    { id: 102, windowId: 2, title: "Google Maps", url: "https://maps.google.com", pinned: false, index: 0, active: false }, // Different window
    { id: 201, windowId: 1, title: "Work CRM", url: "https://crm.work.com", pinned: false, index: 1, active: false }
];
const strategies = [
    {
        id: "strat_new",
        label: "New Window Strat",
        groupingRules: [
            { source: "fixed", value: "NewGroup", windowMode: "new" }
        ],
        filters: [
            { field: "title", operator: "contains", value: "Google" }
        ],
        sortingRules: []
    },
    {
        id: "strat_compound",
        label: "Compound Strat",
        groupingRules: [
            { source: "fixed", value: "CompoundGroup", windowMode: "compound" }
        ],
        filters: [
            { field: "title", operator: "contains", value: "Google" }
        ],
        sortingRules: []
    }
];
(0, groupingStrategies_js_1.setCustomStrategies)(strategies);
async function runTests() {
    console.log("Testing Grouping Logic (Window Modes)...");
    // Test 1: New Window Mode
    console.log("Test 1: New Window Mode");
    const groupsNew = (0, groupingStrategies_js_1.groupTabs)(mockTabs, ["strat_new"]);
    // Should produce ONE group containing both Google tabs, with windowMode='new'
    assert_1.default.strictEqual(groupsNew.length, 1, "Should have 1 group (Google)");
    assert_1.default.strictEqual(groupsNew[0].windowMode, "new", "Group should be 'new' mode");
    assert_1.default.strictEqual(groupsNew[0].tabs.length, 2, "Group should have 2 tabs");
    assert_1.default.ok(groupsNew[0].id.startsWith("global::"), "Bucket key should be global");
    // Test 2: Compound Mode
    console.log("Test 2: Compound Mode");
    const groupsCompound = (0, groupingStrategies_js_1.groupTabs)(mockTabs, ["strat_compound"]);
    assert_1.default.strictEqual(groupsCompound.length, 1, "Should have 1 group");
    assert_1.default.strictEqual(groupsCompound[0].windowMode, "compound", "Group should be 'compound' mode");
    assert_1.default.strictEqual(groupsCompound[0].tabs.length, 2, "Group should have 2 tabs");
    // Test 3: Current Mode (Default)
    console.log("Test 3: Current Mode");
    // Use domain strategy (built-in, current mode)
    const groupsCurrent = (0, groupingStrategies_js_1.groupTabs)(mockTabs, ["domain"]);
    // Should produce THREE groups (one per window per domain)
    // 101 (Google, Win 1) -> Group 1
    // 102 (Google, Win 2) -> Group 2
    // 201 (Work, Win 1) -> Group 3
    assert_1.default.strictEqual(groupsCurrent.length, 3, "Should have 3 groups for Current mode");
    const group1 = groupsCurrent.find(g => g.windowId === 1 && g.label.toLowerCase().includes("google"));
    assert_1.default.ok(group1, "Should find Google group in Win 1");
    assert_1.default.strictEqual(group1?.windowMode, "current", "Group should be 'current' mode");
    console.log("Testing Apply Logic (Mocked)...");
    // Mock spies
    let windowsCreated = 0;
    let tabsMoved = 0;
    let createdWindowId = 0;
    let moveArgs = [];
    chromeMock.windows.create = async (args) => {
        windowsCreated++;
        createdWindowId = 999;
        return { id: 999 };
    };
    chromeMock.tabs.move = async (ids, props) => {
        tabsMoved++;
        moveArgs.push({ ids, props });
    };
    chromeMock.tabs.query = async () => []; // No existing tabs in group
    // Test Apply New
    // groupsNew has 1 group with 2 tabs (101, 102).
    // Should create 1 window, move 102 (since 101 used for creation? or both?)
    // Logic: create({ tabId: 101 }). Then move([102], {windowId: 999}).
    await (0, tabManager_js_1.applyTabGroups)(groupsNew);
    assert_1.default.strictEqual(windowsCreated, 1, "Should create 1 window");
    assert_1.default.strictEqual(tabsMoved, 1, "Should move 1 tab (the other one)");
    assert_1.default.deepStrictEqual(moveArgs[0].props, { windowId: 999, index: -1 });
    // Reset mocks
    windowsCreated = 0;
    tabsMoved = 0;
    moveArgs = [];
    // Test Apply Compound
    // groupsCompound has 1 group with 2 tabs (101 Win1, 102 Win2).
    // Target window: Majority. Win 1 has 1 tab, Win 2 has 1 tab.
    // Logic: first tab window wins -> Win 1.
    // Should move 102 to Win 1.
    await (0, tabManager_js_1.applyTabGroups)(groupsCompound);
    assert_1.default.strictEqual(windowsCreated, 0, "Should NOT create window");
    assert_1.default.strictEqual(tabsMoved, 1, "Should move 1 tab");
    // 102 is in Win 2. Target is Win 1.
    // Note: applyTabGroups receives ids.
    // The implementation passes array of ids to move.
    assert_1.default.deepStrictEqual(moveArgs[0].ids, [102]);
    assert_1.default.deepStrictEqual(moveArgs[0].props, { windowId: 1, index: -1 });
    console.log("All Window Mode tests passed!");
}
runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
