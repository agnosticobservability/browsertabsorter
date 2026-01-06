import { SortingStrategy } from "./types.js";

export interface StrategyDefinition {
    id: SortingStrategy;
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

export const getStrategy = (id: SortingStrategy): StrategyDefinition | undefined => STRATEGIES.find(s => s.id === id);
