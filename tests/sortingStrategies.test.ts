import { describe, test, expect, beforeAll } from "bun:test";
import { compareBy } from "../src/background/sortingStrategies.js";
import { setCustomStrategies } from "../src/background/groupingStrategies.js";
import { TabMetadata, CustomStrategy } from "../src/shared/types.js";

describe("Sorting Strategies", () => {
    const tabA: TabMetadata = {
        id: 1, windowId: 1, title: "Alpha", url: "https://example.com/a", pinned: false,
        lastAccessed: 1000, openerTabId: undefined, context: "Work", index: 0, active: false
    };
    const tabB: TabMetadata = {
        id: 2, windowId: 1, title: "Beta", url: "https://example.com/b", pinned: true,
        lastAccessed: 2000, openerTabId: 1, context: "Personal", index: 1, active: false
    };
    const tabC: TabMetadata = {
        id: 3, windowId: 1, title: "Gamma", url: "https://google.com", pinned: false,
        lastAccessed: 500, openerTabId: undefined, context: undefined, index: 2, active: false
    };

    // Helper to check sort order: compareBy(s, a, b)
    // If < 0, a comes first. If > 0, b comes first.

    test("recency (descending lastAccessed)", () => {
        // B (2000) > A (1000)
        // Expect B first, so compareBy(recency, A, B) should be > 0
        expect(compareBy("recency", tabA, tabB)).toBeGreaterThan(0);
        // A (1000) > C (500)
        // Expect A first, so compareBy(recency, A, C) should be < 0 (wait, recency sorts by most recent first)
        // B, A, C.
        // compare(A, C): A is more recent than C. So A should come before C. result < 0.
        // (C.lastAccessed - A.lastAccessed) = 500 - 1000 = -500 < 0. Correct.
        expect(compareBy("recency", tabA, tabC)).toBeLessThan(0);
    });

    test("pinned (pinned first)", () => {
        // A (unpinned), B (pinned).
        // B should come first. compare(A, B) > 0.
        expect(compareBy("pinned", tabA, tabB)).toBeGreaterThan(0);
        // A (unpinned), C (unpinned). Equal.
        expect(compareBy("pinned", tabA, tabC)).toBe(0);
    });

    test("title (alphabetical)", () => {
        // Alpha vs Beta. Alpha comes first. compare(A, B) < 0.
        expect(compareBy("title", tabA, tabB)).toBeLessThan(0);
        // Gamma vs Beta. Beta comes first. compare(C, B) > 0.
        expect(compareBy("title", tabC, tabB)).toBeGreaterThan(0);
    });

    test("url (alphabetical)", () => {
        // example.com/a vs example.com/b. A < B.
        expect(compareBy("url", tabA, tabB)).toBeLessThan(0);
    });

    test("domain (alphabetical)", () => {
        // example.com vs google.com. E < G.
        expect(compareBy("domain", tabA, tabC)).toBeLessThan(0);
    });

    test("context (alphabetical)", () => {
        // Work vs Personal. P < W. So B (Personal) comes first.
        // compare(A, B) > 0.
        expect(compareBy("context", tabA, tabB)).toBeGreaterThan(0);
        // Work vs undefined. undefined is usually empty string or last.
        // implementation: (a.context ?? "").localeCompare(b.context ?? "")
        // "Work" vs "". "Work" > "". So A comes after C?
        // Wait, "Work" comes AFTER empty string in ascii? No, empty string is usually first.
        // "".localeCompare("Work") -> -1.
        // "Work".localeCompare("") -> 1.
        // So compare(A, C) = 1. A comes after C (C first).
        expect(compareBy("context", tabA, tabC)).toBeGreaterThan(0);
    });

    test("nesting (hierarchy)", () => {
        // A (root) vs B (child).
        // hierarchyScore: root=0, child=1.
        // 0 - 1 = -1 < 0. A comes first.
        // Wait, implementation: hierarchyScore(a) - hierarchyScore(b)
        // We want roots first? Usually roots are top level.
        // If result < 0, A comes first.
        // A is root (0), B is child (1). 0 - 1 = -1. A comes first. Correct.
        expect(compareBy("nesting", tabA, tabB)).toBeLessThan(0);
    });

    test("custom strategy", () => {
        const custom: CustomStrategy = {
            id: "customTitleDesc",
            label: "Reverse Title",
            groupingRules: [],
            sortingRules: [{ field: "title", order: "desc" }]
        };
        setCustomStrategies([custom]);

        // Title: Alpha vs Beta. A < B.
        // Normal sort: -1.
        // Desc sort: 1.
        // Expect compare(A, B) > 0.
        expect(compareBy("customTitleDesc", tabA, tabB)).toBeGreaterThan(0);

        // Reset
        setCustomStrategies([]);
    });

    test("fallback to generic field", () => {
        // Using 'title' as a generic string (should behave like title strategy)
        expect(compareBy("title", tabA, tabB)).toBeLessThan(0);

        // Using a non-existent field
        expect(compareBy("nonexistent", tabA, tabB)).toBe(0);
    });
});
