import { groupTabs, setCustomStrategies } from "../src/background/groupingStrategies.js";
import { TabMetadata, CustomStrategy } from "../src/shared/types.js";
import assert from "assert";

const mockTabs: TabMetadata[] = [
  { id: 1, windowId: 1, title: "Google Search", url: "https://www.google.com/search?q=test", pinned: false },
  { id: 2, windowId: 1, title: "GitHub", url: "https://github.com/jules/repo", pinned: false },
  { id: 3, windowId: 1, title: "Twitter", url: "https://twitter.com/home", pinned: false }
];

// Test Custom Strategy
const customStrategies: CustomStrategy[] = [
    {
        id: "social",
        label: "Social Media",
        type: "grouping",
        rules: [
            { field: "url", operator: "contains", value: "twitter", result: "Social" }
        ]
    }
];

setCustomStrategies(customStrategies);

console.log("Testing Custom Strategy...");
const groups = groupTabs(mockTabs, ["social", "domain"]);

const socialGroup = groups.find(g => g.label.includes("Social"));
assert.ok(socialGroup, "Should create a group for Social");
assert.strictEqual(socialGroup?.tabs.length, 1, "Should have 1 tab in Social group");
assert.strictEqual(socialGroup?.tabs[0].title, "Twitter", "Should match Twitter tab");

console.log("Testing Override Built-in...");
// Override domain strategy
const overrideStrategies: CustomStrategy[] = [
    {
        id: "domain",
        label: "My Domain",
        type: "grouping",
        rules: [
            { field: "domain", operator: "equals", value: "github.com", result: "Code" }
        ]
    }
];

setCustomStrategies(overrideStrategies);
const groups2 = groupTabs(mockTabs, ["domain"]);
const codeGroup = groups2.find(g => g.label.includes("Code"));

assert.ok(codeGroup, "Should create a group 'Code' overriding domain");
assert.strictEqual(codeGroup?.tabs[0].title, "GitHub");

console.log("All tests passed!");
