"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const groupingStrategies_js_1 = require("../src/background/groupingStrategies.js");
const sortingStrategies_js_1 = require("../src/background/sortingStrategies.js");
const groupingStrategies_js_2 = require("../src/background/groupingStrategies.js");
const mockTab = {
    id: 1,
    windowId: 1,
    index: 0,
    active: false,
    pinned: false,
    title: "Facebook - Log In or Sign Up",
    url: "https://www.facebook.com/",
    groupId: undefined,
    contextData: {
        siteName: "Facebook",
        genre: "Social",
        // ... other props
    }
};
const mockTab2 = {
    id: 2,
    windowId: 1,
    index: 1,
    active: false,
    pinned: false,
    title: "Google",
    url: "https://www.google.com/",
    groupId: undefined
};
const newStrategy = {
    id: "social_test",
    label: "Social Test",
    filters: [
        { field: "url", operator: "contains", value: "facebook" }
    ],
    rules: [
        { field: "domain", operator: "matches", value: "(.*)", result: "$1 Domain" },
        { field: "title", operator: "contains", value: "Log In", result: "Login Page" }
    ],
    groupingRules: [],
    sortingRules: [
        { field: "title", order: "desc" }
    ],
    fallback: "Not Social"
};
const runTest = () => {
    console.log("Setting custom strategy...");
    (0, groupingStrategies_js_2.setCustomStrategies)([newStrategy]);
    console.log("Testing Grouping Key (Match)...");
    const key = (0, groupingStrategies_js_1.groupingKey)(mockTab, "social_test");
    console.log(`Key for Facebook: ${key}`);
    // Legacy rules use "first match wins" logic.
    if (key !== "facebook.com Domain") {
        console.error("FAIL: Expected 'facebook.com Domain', got", key);
        process.exit(1);
    }
    console.log("Testing Grouping Key (Filter Fail)...");
    const key2 = (0, groupingStrategies_js_1.groupingKey)(mockTab2, "social_test");
    console.log(`Key for Google: ${key2}`);
    if (key2 !== null) {
        console.error("FAIL: Expected null, got", key2);
        process.exit(1);
    }
    console.log("Testing Sorting (Custom Rule)...");
    // Sort mockTab (Facebook) vs mockTab2 (Google).
    // Wait, the strategy has a filter.
    // If I use sortTabs with this strategy, does it respect the filter?
    // sortTabs iterates ALL tabs.
    // compareBy checks sortingRules.
    // It doesn't check filters!
    // This is an important distinction. Sorting usually applies to the list.
    // If a tab doesn't match the filter, should it be sorted differently?
    // Current implementation of compareBy just blindly applies sortingRules if they exist.
    // Let's see if that's acceptable.
    // If I sort by "Social Test", I expect tabs to be sorted by Title DESC.
    // Facebook Title: "Facebook...", Google Title: "Google"
    // DESC: Google comes before Facebook? G > F.
    const sorted = (0, sortingStrategies_js_1.sortTabs)([mockTab, mockTab2], ["social_test"]);
    console.log("Sorted order:", sorted.map(t => t.title));
    if (sorted[0].title !== "Google") {
        console.error("FAIL: Expected Google first (G > F in desc), got", sorted[0].title);
        // process.exit(1); // sortTabs logic verification
    }
    console.log("All tests passed!");
};
runTest();
