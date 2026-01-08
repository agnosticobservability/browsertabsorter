import { SortingStrategy, TabMetadata, CustomStrategy } from "../shared/types.js";
import { domainFromUrl, semanticBucket, navigationKey, groupingKey, getFieldValue } from "./groupingStrategies.js";
import { getStrategies } from "../shared/strategyRegistry.js";

// We need access to custom strategies to check for sortRules
let customStrategies: CustomStrategy[] = [];
export const setCustomStrategiesForSorting = (strategies: CustomStrategy[]) => {
    customStrategies = strategies;
};

export const recencyScore = (tab: TabMetadata) => tab.lastAccessed ?? 0;
export const hierarchyScore = (tab: TabMetadata) => (tab.openerTabId !== undefined ? 1 : 0);
export const pinnedScore = (tab: TabMetadata) => (tab.pinned ? 0 : 1);

export const sortTabs = (tabs: TabMetadata[], strategies: SortingStrategy[]): TabMetadata[] => {
  const scoring: SortingStrategy[] = strategies.length ? strategies : ["pinned", "recency"];
  return [...tabs].sort((a, b) => {
    for (const strategy of scoring) {
      const diff = compareBy(strategy, a, b);
      if (diff !== 0) return diff;
    }
    return a.id - b.id;
  });
};

export const compareBy = (strategy: SortingStrategy | string, a: TabMetadata, b: TabMetadata): number => {
    // 1. Check Custom Strategies for internal Sort Rules
    const custom = customStrategies.find(s => s.id === strategy);
    if (custom && custom.sortRules && custom.sortRules.length > 0) {
        // Iterate through custom sort rules
        for (const rule of custom.sortRules) {
            const valA = getFieldValue(a, rule.field);
            const valB = getFieldValue(b, rule.field);

            // Basic comparison
            let comparison = 0;
            if (typeof valA === 'string' && typeof valB === 'string') {
                comparison = valA.localeCompare(valB);
            } else {
                if (valA < valB) comparison = -1;
                else if (valA > valB) comparison = 1;
            }

            if (comparison !== 0) {
                return rule.order === 'desc' ? -comparison : comparison;
            }
        }
        // If all sort rules equal, fall back to next strategy or stable sort
        return 0;
    }

  switch (strategy) {
    case "recency":
      return (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0);
    case "nesting": // Formerly hierarchy
      return hierarchyScore(a) - hierarchyScore(b);
    case "pinned":
      return pinnedScore(a) - pinnedScore(b);
    case "title":
      return a.title.localeCompare(b.title);
    case "url":
      return a.url.localeCompare(b.url);
    case "context":
      return (a.context ?? "").localeCompare(b.context ?? "");
    case "domain":
    case "domain_full":
      return domainFromUrl(a.url).localeCompare(domainFromUrl(b.url));
    case "topic":
      return semanticBucket(a.title, a.url).localeCompare(semanticBucket(b.title, b.url));
    case "lineage":
      return navigationKey(a).localeCompare(navigationKey(b));
    case "age":
      // Reverse alphabetical for age buckets (Today < Yesterday), rough approx
      return groupingKey(a, "age").localeCompare(groupingKey(b, "age"));
    default:
      // Check if it's a generic field first
      const valA = getFieldValue(a, strategy);
      const valB = getFieldValue(b, strategy);

      if (valA !== undefined && valB !== undefined) {
          if (valA < valB) return -1;
          if (valA > valB) return 1;
          return 0;
      }

      // Fallback for custom strategies (grouping key) or unhandled built-ins
      return groupingKey(a, strategy).localeCompare(groupingKey(b, strategy));
  }
};
