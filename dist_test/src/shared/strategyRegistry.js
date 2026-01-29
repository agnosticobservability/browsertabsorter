"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStrategy = exports.getStrategies = exports.STRATEGIES = void 0;
// Restored strategies matching background capabilities.
exports.STRATEGIES = [
    { id: "domain", label: "Domain", isGrouping: true, isSorting: true, tags: ["group", "sort"] },
    { id: "domain_full", label: "Full Domain", isGrouping: true, isSorting: true, tags: ["group", "sort"] },
    { id: "topic", label: "Topic", isGrouping: true, isSorting: true, tags: ["group", "sort"] },
    { id: "context", label: "Context", isGrouping: true, isSorting: true, tags: ["group", "sort"] },
    { id: "lineage", label: "Lineage", isGrouping: true, isSorting: true, tags: ["group", "sort"] },
    { id: "pinned", label: "Pinned", isGrouping: true, isSorting: true, tags: ["group", "sort"] },
    { id: "recency", label: "Recency", isGrouping: true, isSorting: true, tags: ["group", "sort"] },
    { id: "age", label: "Age", isGrouping: true, isSorting: true, tags: ["group", "sort"] },
    { id: "url", label: "URL", isGrouping: true, isSorting: true, tags: ["group", "sort"] },
    { id: "nesting", label: "Nesting", isGrouping: true, isSorting: true, tags: ["group", "sort"] },
    { id: "title", label: "Title", isGrouping: true, isSorting: true, tags: ["group", "sort"] },
];
const getStrategies = (customStrategies) => {
    if (!customStrategies || customStrategies.length === 0)
        return exports.STRATEGIES;
    // Custom strategies can override built-ins if IDs match, or add new ones.
    const combined = [...exports.STRATEGIES];
    customStrategies.forEach(custom => {
        const existingIndex = combined.findIndex(s => s.id === custom.id);
        // Determine capabilities based on rules presence
        const hasGrouping = (custom.groupingRules && custom.groupingRules.length > 0) || (custom.rules && custom.rules.length > 0) || false;
        const hasSorting = (custom.sortingRules && custom.sortingRules.length > 0) || (custom.rules && custom.rules.length > 0) || false;
        const tags = [];
        if (hasGrouping)
            tags.push("group");
        if (hasSorting)
            tags.push("sort");
        const definition = {
            id: custom.id,
            label: custom.label,
            isGrouping: hasGrouping,
            isSorting: hasSorting,
            tags: tags,
            autoRun: custom.autoRun,
            isCustom: true
        };
        if (existingIndex !== -1) {
            combined[existingIndex] = definition;
        }
        else {
            combined.push(definition);
        }
    });
    return combined;
};
exports.getStrategies = getStrategies;
const getStrategy = (id) => exports.STRATEGIES.find(s => s.id === id);
exports.getStrategy = getStrategy;
