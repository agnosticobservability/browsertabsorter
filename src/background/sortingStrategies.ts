import { SortingStrategy, TabMetadata, CustomStrategy, SortingRule } from "../shared/types.js";
import { domainFromUrl, semanticBucket, navigationKey, groupingKey, getFieldValue, getCustomStrategies } from "./groupingStrategies.js";
import { logDebug } from "../shared/logger.js";
import { asArray } from "../shared/utils.js";

// Helper scores
export const recencyScore = (tab: TabMetadata) => tab.lastAccessed ?? 0;
export const hierarchyScore = (tab: TabMetadata) => (tab.openerTabId !== undefined ? 1 : 0);
export const pinnedScore = (tab: TabMetadata) => (tab.pinned ? 0 : 1);

type Comparator = (a: TabMetadata, b: TabMetadata) => number;

// --- Built-in Comparators ---

const compareRecency: Comparator = (a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0);
const compareNesting: Comparator = (a, b) => hierarchyScore(a) - hierarchyScore(b);
const comparePinned: Comparator = (a, b) => pinnedScore(a) - pinnedScore(b);
const compareTitle: Comparator = (a, b) => a.title.localeCompare(b.title);
const compareUrl: Comparator = (a, b) => a.url.localeCompare(b.url);
const compareContext: Comparator = (a, b) => (a.context ?? "").localeCompare(b.context ?? "");
const compareDomain: Comparator = (a, b) => domainFromUrl(a.url).localeCompare(domainFromUrl(b.url));
const compareTopic: Comparator = (a, b) => semanticBucket(a.title, a.url).localeCompare(semanticBucket(b.title, b.url));
const compareLineage: Comparator = (a, b) => navigationKey(a).localeCompare(navigationKey(b));
const compareAge: Comparator = (a, b) => (groupingKey(a, "age") || "").localeCompare(groupingKey(b, "age") || "");

const strategyRegistry: Record<string, Comparator> = {
  recency: compareRecency,
  nesting: compareNesting,
  pinned: comparePinned,
  title: compareTitle,
  url: compareUrl,
  context: compareContext,
  domain: compareDomain,
  domain_full: compareDomain,
  topic: compareTopic,
  lineage: compareLineage,
  age: compareAge,
};

// --- Custom Strategy Evaluation ---

const evaluateCustomStrategy = (strategy: string, a: TabMetadata, b: TabMetadata): number | null => {
  const customStrats = getCustomStrategies();
  const custom = customStrats.find(s => s.id === strategy);

  if (!custom) return null;

  const sortRulesList = asArray<SortingRule>(custom.sortingRules);
  if (sortRulesList.length === 0) return null;

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

  // If rules exist but all equal, return 0 (tie)
  return 0;
};

// --- Generic Fallback ---

const evaluateGenericStrategy = (strategy: string, a: TabMetadata, b: TabMetadata): number => {
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
    return (groupingKey(a, strategy) || "").localeCompare(groupingKey(b, strategy) || "");
};

// --- Main Export ---

export const compareBy = (strategy: SortingStrategy | string, a: TabMetadata, b: TabMetadata): number => {
  // 1. Custom Strategy (takes precedence if rules exist)
  const customDiff = evaluateCustomStrategy(strategy, a, b);
  if (customDiff !== null) {
      return customDiff;
  }

  // 2. Built-in registry
  const builtIn = strategyRegistry[strategy];
  if (builtIn) {
    return builtIn(a, b);
  }

  // 3. Generic/Fallback
  return evaluateGenericStrategy(strategy, a, b);
};

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
