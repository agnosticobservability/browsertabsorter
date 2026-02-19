
import { getGroupingResult, GroupingRule, TabMetadata } from '../src/background/groupingStrategies';
import { setCustomStrategies } from '../src/background/groupingStrategies';
import { CustomStrategy } from '../src/shared/types';

const mockTab: TabMetadata = {
    id: 1,
    windowId: 1,
    title: "Example Domain",
    url: "https://www.example.com/path",
    pinned: false,
    active: false,
    index: 0,
    selected: false,
    context: "Work",
    contextData: {
        domain: "example.com"
    } as any
};

console.log("Testing Fixed Value...");
const fixedStrategy: CustomStrategy = {
    id: "fixed_test",
    label: "Fixed Test",
    groupingRules: [{
        source: "fixed",
        value: "My Static Group",
        transform: "uppercase"
    }],
    sortingRules: [],
    filters: []
};
setCustomStrategies([fixedStrategy]);
const res1 = getGroupingResult(mockTab, "fixed_test");
console.log("Fixed Result:", res1.key); // Expected: "MY STATIC GROUP"

console.log("Testing Field Value with Regex (capture)...");
const regexStrategy: CustomStrategy = {
    id: "regex_test",
    label: "Regex Test",
    groupingRules: [{
        source: "field",
        value: "url",
        transform: "regex",
        transformPattern: "example\\.(com)"
    }],
    sortingRules: [],
    filters: []
};
setCustomStrategies([regexStrategy]);
const res2 = getGroupingResult(mockTab, "regex_test");
console.log("Regex Result (capture):", res2.key); // Expected: "com"

console.log("Testing Field Value with Regex (no capture) - Expect Full Match...");
const regexNoCaptureStrategy: CustomStrategy = {
    id: "regex_no_capture_test",
    label: "Regex No Capture Test",
    groupingRules: [{
        source: "field",
        value: "url",
        transform: "regex",
        transformPattern: "example\\.com"
    }],
    sortingRules: [],
    filters: []
};
setCustomStrategies([regexNoCaptureStrategy]);
const res3 = getGroupingResult(mockTab, "regex_no_capture_test");
console.log("Regex Result (no capture):", res3.key); // Expected: "example.com"

console.log("Testing Regex Replacement...");
const regexReplaceStrategy: CustomStrategy = {
    id: "regex_replace_test",
    label: "Regex Replace Test",
    groupingRules: [{
        source: "field",
        value: "url",
        transform: "regex",
        transformPattern: ".*(example)\\.com.*",
        replacement: "Site: $1"
    }],
    sortingRules: [],
    filters: []
};
setCustomStrategies([regexReplaceStrategy]);
const res4 = getGroupingResult(mockTab, "regex_replace_test");
console.log("Regex Replace Result:", res4.key); // Expected: "Site: example"
