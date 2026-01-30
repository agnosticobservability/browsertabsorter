"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const groupingStrategies_js_1 = require("../src/background/groupingStrategies.js");
const groupingStrategies_js_2 = require("../src/background/groupingStrategies.js");
// Mock Chrome API if needed (groupingStrategies doesn't use chrome directly, but logger might?)
// groupingStrategies uses logDebug from ./logger.js. Logger likely uses console.log.
const mockTabs = [
    {
        id: 1,
        windowId: 1,
        title: "Google",
        url: "https://www.google.com",
        pinned: false,
        active: false,
        status: "complete",
        index: 0,
        selected: false,
        openerTabId: undefined,
        lastAccessed: Date.now()
    },
    {
        id: 2,
        windowId: 1,
        title: "GitHub",
        url: "https://github.com/user/repo",
        pinned: false,
        active: true,
        status: "complete",
        index: 1,
        selected: true,
        openerTabId: undefined,
        lastAccessed: Date.now()
    }
];
const mockStrategy = {
    id: "temp_sim_id",
    label: "Simulation",
    filters: [],
    groupingRules: [
        {
            source: "field",
            value: "domain",
            color: "blue",
            transform: "none",
            windowMode: "current"
        }
    ],
    sortingRules: [],
    groupSortingRules: [],
    fallback: "Misc",
    sortGroups: false,
    autoRun: false
};
// Set strategy
(0, groupingStrategies_js_2.setCustomStrategies)([mockStrategy]);
// Run grouping
const groups = (0, groupingStrategies_js_1.groupTabs)(mockTabs, ["temp_sim_id"]);
console.log("Groups created:", groups.length);
groups.forEach(g => {
    console.log(`Group: ${g.label}, Tabs: ${g.tabs.length}`);
});
if (groups.length === 0) {
    console.error("No groups created!");
    process.exit(1);
}
else {
    console.log("Success!");
}
