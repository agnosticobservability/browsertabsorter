import { SortingStrategy, TabMetadata, CustomStrategy, SortingRule } from "../shared/types.js";
import { domainFromUrl, semanticBucket, navigationKey, groupingKey, getFieldValue, getCustomStrategies } from "./groupingStrategies.js";
import { logDebug } from "./logger.js";
import { asArray } from "../shared/utils.js";

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
  // 1. Check Custom Strategies for Sorting Rules
  const customStrats = getCustomStrategies();
  const custom = customStrats.find(s => s.id === strategy);
  if (custom) {
      const sortRulesList = asArray<SortingRule>(custom.sortingRules);
      if (sortRulesList.length > 0) {
          // Evaluate custom sorting rules in order
          try {
              for (const rule of sortRulesList) {
                  if (!rule) continue;
                  const valA = getFieldValue(a, rule.field);
                  const valB = getFieldValue(b, rule.field);

                  let result = 0;
                  if (valA < valB) result = -1;
                  else if (valA > valB) result = 1;

                  if (result !== 0) {
                      return rule.order === 'desc' ? -result : result;
                  }
              }
          } catch (e) {
              logDebug("Error evaluating custom sorting rules", { error: String(e) });
          }
          // If all rules equal, continue to next strategy (return 0)
          return 0;
      }
  }

  // 2. Built-in or fallback
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

      // Fallback for custom strategies grouping key (if using custom strategy as sorting but no sorting rules defined)
      // or unhandled built-ins
      return groupingKey(a, strategy).localeCompare(groupingKey(b, strategy));
  }
};
