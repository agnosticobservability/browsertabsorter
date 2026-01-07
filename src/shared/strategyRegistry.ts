import { CustomStrategy, SortingStrategy } from "./types.js";

export interface StrategyDefinition {
    id: SortingStrategy | string;
    label: string;
    isGrouping: boolean;
    isSorting: boolean;
}

export const STRATEGIES: StrategyDefinition[] = [
    { id: "pinned", label: "Pinned", isGrouping: true, isSorting: true },
    { id: "context", label: "Context", isGrouping: true, isSorting: true },
    { id: "age", label: "Age", isGrouping: true, isSorting: true },
    { id: "recency", label: "Recency", isGrouping: false, isSorting: true },
    { id: "lineage", label: "Lineage", isGrouping: true, isSorting: true },
    { id: "nesting", label: "Nesting", isGrouping: true, isSorting: true },
    { id: "domain", label: "Domain", isGrouping: true, isSorting: true },
    { id: "url", label: "URL", isGrouping: false, isSorting: true },
    { id: "topic", label: "Topic", isGrouping: true, isSorting: true },
    { id: "title", label: "Title", isGrouping: false, isSorting: true },
];

export const getStrategies = (customStrategies?: CustomStrategy[]): StrategyDefinition[] => {
    if (!customStrategies || customStrategies.length === 0) return STRATEGIES;

    // Custom strategies can override built-ins if IDs match, or add new ones.
    const combined = [...STRATEGIES];

    customStrategies.forEach(custom => {
        const existingIndex = combined.findIndex(s => s.id === custom.id);
        const definition: StrategyDefinition = {
            id: custom.id,
            label: custom.label,
            isGrouping: custom.type === 'grouping',
            isSorting: true // Custom grouping implies sorting capability (sorting by group label)
        };

        if (existingIndex !== -1) {
            combined[existingIndex] = definition;
        } else {
            combined.push(definition);
        }
    });

    return combined;
};

export const getStrategy = (id: SortingStrategy | string): StrategyDefinition | undefined => STRATEGIES.find(s => s.id === id);
