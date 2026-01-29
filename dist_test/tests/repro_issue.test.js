"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tabManager_js_1 = require("../src/background/tabManager.js");
const assert_1 = __importDefault(require("assert"));
// Mock Chrome API
let groupArgs = [];
const chromeMock = {
    tabs: {
        query: async (info) => [],
        group: async (opts) => {
            groupArgs.push(opts);
            return 1;
        },
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
    { id: 101, windowId: 50, title: "Google Search", url: "https://google.com", pinned: false, index: 0, active: false }
];
async function runTests() {
    console.log("Testing Repro Issue (Implicit Window Grouping)...");
    // Setup: One group in 'current' mode (implicit)
    const testGroup = {
        id: "window-50::group1",
        windowId: 50,
        label: "My Group",
        color: "blue",
        tabs: mockTabs, // Tab is in Window 50
        reason: "Test",
        windowMode: "current"
    };
    // Reset mocks
    groupArgs = [];
    // Run Apply
    await (0, tabManager_js_1.applyTabGroups)([testGroup]);
    // Verify
    assert_1.default.strictEqual(groupArgs.length, 1, "Should call chrome.tabs.group once");
    const args = groupArgs[0];
    console.log("chrome.tabs.group called with:", JSON.stringify(args));
    // Assert that windowId IS specified in createProperties
    // If missing, chrome defaults to "current focused window", which causes the bug.
    assert_1.default.ok(args.createProperties, "createProperties should be present");
    assert_1.default.strictEqual(args.createProperties.windowId, 50, "windowId should be explicitly set to 50");
    console.log("Repro Test Passed!");
}
runTests().catch(e => {
    console.error("Test Failed:", e.message);
    process.exit(1);
});
