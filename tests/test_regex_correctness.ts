import { setCustomStrategies, groupTabs } from "../src/background/groupingStrategies.ts";
import { CustomStrategy, TabMetadata, StrategyRule, GroupingRule } from "../src/shared/types.ts";
import assert from "assert";

// Mock tabs
const tabs: TabMetadata[] = [
    { id: 1, windowId: 1, title: "Apple", url: "https://apple.com", pinned: false, index: 0, active: false },
    { id: 2, windowId: 1, title: "banana", url: "https://banana.com", pinned: false, index: 1, active: false },
    { id: 3, windowId: 1, title: "Cherry", url: "https://cherry.com", pinned: false, index: 2, active: false }
];

// 1. Test Legacy Rules (case-insensitive by default in implementation)
// The implementation uses 'i' flag for legacy rules 'matches'.
const legacyStrategy: CustomStrategy = {
    id: "legacy_regex",
    label: "Legacy Regex",
    groupingRules: [],
    sortingRules: [],
    rules: [
        { field: "title", operator: "matches", value: "^apple$", result: "Fruits" }, // Should match Apple (case-insensitive)
        { field: "title", operator: "matches", value: "^Banana$", result: "Fruits" }  // Should match banana (case-insensitive)
    ]
};

// 2. Test Transform Regex (case-sensitive by default in implementation, empty flags)
const transformStrategyWithCapture: CustomStrategy = {
    id: "transform_regex_capture",
    label: "Transform Regex Capture",
    groupingRules: [
        {
            source: "field",
            value: "title",
            transform: "regex",
            transformPattern: "^([A-Z][a-z]+)$", // Capture the word (Capitalized)
            color: "blue"
        }
    ],
    sortingRules: []
};

setCustomStrategies([legacyStrategy, transformStrategyWithCapture]);

console.log("Verifying Legacy Regex (Case Insensitive)...");
const legacyGroups = groupTabs(tabs, ["legacy_regex"]);
const fruitGroup = legacyGroups.find(g => g.label === "Fruits");
assert.ok(fruitGroup, "Should find Fruits group");
assert.strictEqual(fruitGroup?.tabs.length, 2, "Should have 2 tabs (Apple, banana) in Fruits group");

console.log("Verifying Transform Regex (Case Sensitive)...");
const transformCaptureGroups = groupTabs(tabs, ["transform_regex_capture"]);

const appleGroup = transformCaptureGroups.find(g => g.label.includes("Apple"));
assert.ok(appleGroup, "Should find Apple group");

const cherryGroup = transformCaptureGroups.find(g => g.label.includes("Cherry"));
assert.ok(cherryGroup, "Should find Cherry group");

// Non-matching items fall back to "Misc" key, but generateLabel filters "Misc", so label is "Group"
const miscGroup = transformCaptureGroups.find(g => g.label === "Group");
assert.ok(miscGroup, "Should find Group (fallback) for non-matching items");
const bananaInMisc = miscGroup?.tabs.find(t => t.title === "banana");
assert.ok(bananaInMisc, "banana should be in fallback group");

console.log("Verification Passed!");
