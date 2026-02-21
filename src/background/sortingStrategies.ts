import { SortingStrategy, TabMetadata, CustomStrategy, SortingRule } from "../shared/types.js";
import { domainFromUrl, semanticBucket, navigationKey, groupingKey, getFieldValue, getCustomStrategies } from "./groupingStrategies.js";
import { logDebug } from "../shared/logger.js";
import { asArray } from "../shared/utils.js";

// Helper scores
export const recencyScore = (tab: TabMetadata) => tab.lastAccessed ?? 0;
export const hierarchyScore = (tab: TabMetadata) => (tab.openerTabId !== undefined ? 1 : 0);
export const pinnedScore = (tab: TabMetadata) => (tab.pinned ? 0 : 1);

export const compareValues = (a: any, b: any, order: 'asc' | 'desc' = 'asc'): number => {
    // Treat undefined/null as "greater" than everything else (pushed to end in asc)
    const isANull = a === undefined || a === null;
    const isBNull = b === undefined || b === null;

    if (isANull && isBNull) return 0;
    if (isANull) return 1; // a > b (a is null)
    if (isBNull) return -1; // b > a (b is null) -> a < b

    let result = 0;
    if (a < b) result = -1;
    else if (a > b) result = 1;

    return order === 'desc' ? -result : result;
};

export const compareBySortingRules = (rules: SortingRule[], a: TabMetadata, b: TabMetadata): number => {
    const sortRulesList = asArray<SortingRule>(rules);
    if (sortRulesList.length === 0) return 0;

    try {
        for (const rule of sortRulesList) {
            if (!rule) continue;
            const valA = getFieldValue(a, rule.field);
            const valB = getFieldValue(b, rule.field);

            const diff = compareValues(valA, valB, rule.order || 'asc');
            if (diff !== 0) return diff;
        }
    } catch (e) {
        logDebug("Error evaluating sorting rules", { error: String(e) });
    }
    return 0;
};

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

  return compareBySortingRules(sortRulesList, a, b);
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
