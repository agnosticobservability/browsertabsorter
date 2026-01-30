"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const groupingStrategies_1 = require("../src/background/groupingStrategies");
// Mock chrome
global.chrome = {
    runtime: { id: 'test' }
};
const tab = {
    id: 1, windowId: 1, title: "Test Tab", url: "https://example.com/foo-123",
    pinned: false, active: false, index: 0, status: 'complete', selected: false
};
const strategies = [{
        id: "regex-test",
        label: "Regex Test",
        groupingRules: [
            { source: "field", value: "url", transform: "regex", transformPattern: "foo-(\\d+)", color: "red" }
        ],
        filters: [],
        filterGroups: [],
        sortingRules: []
    }];
(0, groupingStrategies_1.setCustomStrategies)(strategies);
console.log("Testing regex extraction...");
const result = (0, groupingStrategies_1.getGroupingResult)(tab, "regex-test");
console.log("Result:", result);
if (result.key !== "123") {
    console.error("Expected 123, got", result.key);
    process.exit(1);
}
// Run again to ensure cache doesn't break anything
const result2 = (0, groupingStrategies_1.getGroupingResult)(tab, "regex-test");
if (result2.key !== "123") {
    console.error("Second run: Expected 123, got", result2.key);
    process.exit(1);
}
console.log("Regex verification passed!");
