import { SortingStrategy, TabMetadata } from "../shared/types.js";
import { domainFromUrl, semanticBucket, navigationKey, groupingKey } from "./groupingStrategies.js";

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
      // Fallback for custom strategies or unhandled built-ins
      return groupingKey(a, strategy).localeCompare(groupingKey(b, strategy));
  }
};
