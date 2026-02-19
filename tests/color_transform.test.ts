import { describe, expect, test } from "bun:test";
import { groupTabs, setCustomStrategies } from "../src/background/groupingStrategies";
import { TabMetadata, CustomStrategy } from "../src/shared/types";

describe("Color Transform Logic", () => {
    const mockTabs: TabMetadata[] = [
        { id: 1, windowId: 1, title: "Project A - Urgent Task", url: "https://example.com/1", pinned: false, index: 0, active: false },
        { id: 2, windowId: 1, title: "Project A - Normal Task", url: "https://example.com/2", pinned: false, index: 1, active: false },
        { id: 3, windowId: 1, title: "Project B - Urgent Task", url: "https://example.com/3", pinned: false, index: 2, active: false },
        { id: 4, windowId: 1, title: "Project B - Normal Task", url: "https://example.com/4", pinned: false, index: 3, active: false }
    ];

    test("should color groups based on regex match of a field", () => {
        // Strategy: Group by "Project X" (from title), Color by "Urgent/Normal" (from title)
        const strategy: CustomStrategy = {
            id: "project-status-color",
            label: "Project with Status Color",
            groupingRules: [
                {
                    source: "field",
                    value: "title",
                    transform: "regex",
                    transformPattern: "^(Project [A-Z])", // Extract "Project A"
                    color: "field",
                    colorField: "title",
                    colorTransform: "regex",
                    colorTransformPattern: " - (Urgent|Normal)" // Extract "Urgent" or "Normal"
                }
            ],
            sortingRules: [],
            filters: []
        };

        setCustomStrategies([strategy]);

        const groups = groupTabs(mockTabs, ["project-status-color"]);

        expect(groups.length).toBe(2); // Project A and Project B

        const groupA = groups.find(g => g.label.includes("Project A"));
        const groupB = groups.find(g => g.label.includes("Project B"));

        expect(groupA).toBeDefined();
        expect(groupB).toBeDefined();

        // Project A has "Urgent" (tab 1) and "Normal" (tab 2).
        // Since tab 1 is first, the group color should be based on "Urgent".
        // Project B has "Urgent" (tab 3) and "Normal" (tab 4).
        // Since tab 3 is first, the group color should be based on "Urgent".

        // Therefore, both groups should have the SAME color (assuming deterministic hashing of "Urgent").
        expect(groupA?.color).toBe(groupB?.color);
    });

    test("should produce different colors for different regex matches", () => {
         const strategy: CustomStrategy = {
            id: "color-diff",
            label: "Color Diff",
            groupingRules: [
                {
                    source: "field",
                    value: "id", // Group by ID (unique groups)
                    color: "field",
                    colorField: "title",
                    colorTransform: "regex",
                    colorTransformPattern: " - (Category [A-Z])"
                }
            ],
            sortingRules: [],
            filters: []
        };
        setCustomStrategies([strategy]);

        const tabsWithCategories: TabMetadata[] = [
            { id: 10, windowId: 1, title: "Item 1 - Category A", url: "https://a.com", pinned: false, index: 0, active: false },
            { id: 20, windowId: 1, title: "Item 2 - Category B", url: "https://b.com", pinned: false, index: 1, active: false }
        ];

        const groups = groupTabs(tabsWithCategories, ["color-diff"]);
        expect(groups.length).toBe(2);

        const g1 = groups.find(g => g.tabs[0].id === 10);
        const g2 = groups.find(g => g.tabs[0].id === 20);

        // Try to ensure they are different. "Category A" vs "Category B"
        // If they collide, we are unlucky. But we can debug.
        // Assuming they don't collide for now.
        expect(g1?.color).not.toBe(g2?.color);
    });
});
