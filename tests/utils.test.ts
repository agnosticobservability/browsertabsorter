import assert from "assert";

// Mock global chrome before importing the module
global.chrome = {
  tabs: {
    TAB_ID_NONE: -1
  },
  storage: {
    local: {
      get: () => {}
    }
  }
} as any;

import { mapChromeTab, escapeHtml } from "../src/shared/utils.js";

console.log("Running mapChromeTab tests...");

// Test 1: Valid Tab
const validTab = {
  id: 123,
  windowId: 456,
  index: 0,
  title: "Example",
  url: "https://example.com",
  pinned: false,
  active: true,
  highlighted: true,
  groupId: -1,
  incognito: false,
  selected: true,
  discarded: false,
  autoDiscardable: true,
  width: 100,
  height: 100
} as chrome.tabs.Tab;

const result1 = mapChromeTab(validTab);
assert.notStrictEqual(result1, null, "Should return metadata for valid tab");
assert.strictEqual(result1!.id, 123);
assert.strictEqual(result1!.windowId, 456);
assert.strictEqual(result1!.title, "Example");
assert.strictEqual(result1!.url, "https://example.com");
assert.strictEqual(result1!.active, true);
assert.strictEqual(result1!.selected, true); // highlighted maps to selected

// Test 2: Minimal Tab (defaults)
const minimalTab = {
  id: 789,
  windowId: 101,
  index: 1,
  highlighted: false,
  active: false,
  pinned: false,
  incognito: false,
  selected: false,
  discarded: false,
  autoDiscardable: true
} as chrome.tabs.Tab;

const result2 = mapChromeTab(minimalTab);
assert.notStrictEqual(result2, null, "Should return metadata for minimal tab");
assert.strictEqual(result2!.title, "Untitled", "Should default title to Untitled");
assert.strictEqual(result2!.url, "about:blank", "Should default url to about:blank");

// Test 3: Missing ID
const noIdTab = {
  windowId: 101,
  index: 1
} as chrome.tabs.Tab;

const result3 = mapChromeTab(noIdTab);
assert.strictEqual(result3, null, "Should return null if id is missing");

// Test 4: Missing Window ID
const noWindowIdTab = {
  id: 123,
  index: 1
} as chrome.tabs.Tab;

const result4 = mapChromeTab(noWindowIdTab);
assert.strictEqual(result4, null, "Should return null if windowId is missing");

// Test 5: TAB_ID_NONE
const tabIdNone = {
  id: chrome.tabs.TAB_ID_NONE, // -1
  windowId: 101,
  index: 1
} as chrome.tabs.Tab;

const result5 = mapChromeTab(tabIdNone);
// This is expected to fail with current implementation if check is missing
assert.strictEqual(result5, null, "Should return null if id is TAB_ID_NONE");

console.log("All mapChromeTab tests passed!");

console.log("Running escapeHtml tests...");

// Test 1: Basic text (no escaping needed)
assert.strictEqual(escapeHtml("Hello World"), "Hello World");

// Test 2: Special characters
assert.strictEqual(escapeHtml("<div>"), "&lt;div&gt;");
assert.strictEqual(escapeHtml("Me & You"), "Me &amp; You");
assert.strictEqual(escapeHtml('Say "Hello"'), "Say &quot;Hello&quot;");
assert.strictEqual(escapeHtml("It's me"), "It&#039;s me");

// Test 3: Mixed characters
assert.strictEqual(escapeHtml('<script>alert("XSS")</script>'), "&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;");

// Test 4: Empty string
assert.strictEqual(escapeHtml(""), "");

// Test 5: Null/Undefined handling (though typed as string, good to be safe if called from JS)
// Note: The implementation checks `if (!text) return ''` so null/undefined should return empty string if passed
assert.strictEqual(escapeHtml(null as any), "");
assert.strictEqual(escapeHtml(undefined as any), "");

console.log("All escapeHtml tests passed!");
