
import { describe, expect, test, beforeEach } from "bun:test";
import { groupTabs, setCustomStrategies } from "../src/background/groupingStrategies";
import { sortTabs } from "../src/background/sortingStrategies";
import { TabMetadata, CustomStrategy } from "../src/shared/types";

const createTab = (id: number, title: string, url: string, props: Partial<TabMetadata> = {}): TabMetadata => ({
    id,
    windowId: 1,
    title,
    url,
    pinned: false,
    active: false,
    index: 0,
    ...props
});

describe("Group Coloring Logic", () => {
    beforeEach(() => {
        setCustomStrategies([]);
    });

    test("should assign stable colors for 'match' color rule", () => {
        const strategy: CustomStrategy = {
            id: "domain-color",
            name: "Domain Color",
            type: "grouping",
            groupingRules: [{
                source: "field",
                value: "domain",
                color: "match"
            }],
            filters: [],
            filterGroups: [],
            sortingRules: [],
            groupSortingRules: []
        };
        setCustomStrategies([strategy]);

        const tabs1 = [createTab(1, "Google", "https://google.com")];
        const groups1 = groupTabs(tabs1, ["domain-color"]);
        const color1 = groups1[0].color;

        const tabs2 = [
            createTab(2, "Example", "https://example.com"),
            createTab(1, "Google", "https://google.com")
        ];
        const groups2 = groupTabs(tabs2, ["domain-color"]);

        const googleGroup = groups2.find(g => g.label.includes("google.com"));
        expect(googleGroup).toBeDefined();
        expect(googleGroup?.color).toBe(color1);
    });

    test("should assign stable colors for default strategy even if order changes", () => {
         const strategy: CustomStrategy = {
            id: "domain-no-color",
            name: "Domain No Color",
            type: "grouping",
            groupingRules: [{
                source: "field",
                value: "domain"
            }],
            filters: [],
            filterGroups: [],
            sortingRules: [],
            groupSortingRules: []
        };
        setCustomStrategies([strategy]);

        const tabs1 = [createTab(1, "Google", "https://google.com")];
        const groups1 = groupTabs(tabs1, ["domain-no-color"]);
        const color1 = groups1[0].color;

        const tabs2 = [
            createTab(2, "Example", "https://example.com"),
            createTab(1, "Google", "https://google.com")
        ];
        const groups2 = groupTabs(tabs2, ["domain-no-color"]);

        const googleGroup = groups2.find(g => g.label.includes("google.com"));
        expect(googleGroup).toBeDefined();
        expect(googleGroup?.color).toBe(color1);
    });
});


test("should keep field-based group colors stable regardless tab input order", () => {
    const strategy: CustomStrategy = {
        id: "field-color-stable",
        name: "Field Color Stable",
        type: "grouping",
        groupingRules: [{
            source: "field",
            value: "domain",
            color: "field",
            colorField: "title",
            colorTransform: "firstChar"
        }],
        filters: [],
        filterGroups: [],
        sortingRules: [],
        groupSortingRules: []
    };
    setCustomStrategies([strategy]);

    const tabsA = [
        createTab(1, "Alpha Work", "https://example.com/a"),
        createTab(2, "Beta Work", "https://example.com/b")
    ];
    const colorA = groupTabs(tabsA, ["field-color-stable"])[0].color;

    const tabsB = [
        createTab(2, "Beta Work", "https://example.com/b"),
        createTab(1, "Alpha Work", "https://example.com/a")
    ];
    const colorB = groupTabs(tabsB, ["field-color-stable"])[0].color;

    expect(colorB).toBe(colorA);
});

describe("Tab Sorting Logic", () => {
    test("should sort tabs with missing fields correctly", () => {
         const strategy: CustomStrategy = {
            id: "custom-sort-field",
            name: "Custom Sort Field",
            type: "sorting",
            sortingRules: [{
                field: "contextData.author", // Only present on some tabs
                order: "asc"
            }],
            groupingRules: [],
            filters: [],
            filterGroups: [],
            groupSortingRules: []
        };
        setCustomStrategies([strategy]);

        const tabs = [
            createTab(1, "No Author 1", "https://a.com"),
            createTab(2, "Author Bob", "https://b.com", { contextData: { author: "Bob" } } as any),
            createTab(3, "No Author 2", "https://c.com"),
            createTab(4, "Author Alice", "https://d.com", { contextData: { author: "Alice" } } as any)
        ];

        // Expected behavior: Undefined values should probably be grouped together, either at start or end.
        // Current implementation: undefined == undefined, undefined == string (false < false).
        // If comparison returns 0, stable sort preserves original order.

        // Comparison:
        // 1 vs 2: undefined vs Bob. undefined < Bob (false), Bob < undefined (false). Equal. Order: 1, 2
        // 2 vs 3: Bob vs undefined. Equal. Order: 2, 3
        // 3 vs 4: undefined vs Alice. Equal. Order: 3, 4

        // So effectively, it considers everything equal to everything else if one is undefined?
        // Wait.
        // If sort is stable (JS sort is stable):
        // 1, 2, 3, 4

        // If we want sorting to work, we must handle undefined explicitly.
        // Let's see what happens.

        const sorted = sortTabs(tabs, ["custom-sort-field"]);
        const titles = sorted.map(t => t.title);

        // If sorting was working "correctly" (treating undefined as empty string or null),
        // Alice should be first, Bob second, then undefineds (or undefineds first).

        // With current logic:
        // Alice vs Bob -> Alice < Bob.

        // But undefined comparisons are messing it up?
        // JS sort compares a and b.
        // 1 vs 2: 0
        // 2 vs 3: 0
        // 3 vs 4: 0
        // ...
        // 2 vs 4: Bob vs Alice. Bob > Alice. Result 1.

        // If A=1, B=2. 0.
        // If A=2, B=4. 1.
        // Sorting algorithm might get confused if transitivity doesn't hold.
        // (A=B, B=C, but A!=C).
        // undefined=Bob, Bob!=Alice, Alice=undefined.
        // This breaks transitivity! undefined == Bob, undefined == Alice. But Bob != Alice.

        // This is definitely a bug in sorting logic.
        expect(titles).toEqual(["Author Alice", "Author Bob", "No Author 1", "No Author 2"]);
        // Or undefineds first. But they should be separated from defined ones.
    });
});
