
import { test, expect, mock } from "bun:test";
import { sortTabs } from "../src/background/sortingStrategies.js";
import { TabMetadata } from "../src/shared/types.js";

// Mock dependencies
mock.module("../src/background/groupingStrategies.js", () => ({
  getFieldValue: mock((tab, field) => {
      if (field === 'crash') throw new Error("Crash!");
      if (field === 'object') return { toString: () => { throw new Error("ToString Crash!"); } };
      return (tab as any)[field];
  }),
  getCustomStrategies: mock(() => []),
  groupingKey: mock(() => "key"),
  domainFromUrl: mock(() => "domain"),
  semanticBucket: mock(() => "bucket"),
  navigationKey: mock(() => "nav"),
}));

test("sortTabs should handle errors gracefully", () => {
    const tabs: TabMetadata[] = [
        { id: 1, title: "A", url: "http://a.com", pinned: false, index: 0, windowId: 1, active: false },
        { id: 2, title: "B", url: "http://b.com", pinned: false, index: 1, windowId: 1, active: false }
    ];

    // Should not crash
    expect(() => sortTabs(tabs, ["title"])).not.toThrow();
    expect(() => sortTabs(tabs, ["crash"])).not.toThrow(); // This should trigger crash in mock
});
