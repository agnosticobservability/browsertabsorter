import { GroupingStrategy, SortingStrategy, TabGroup, TabMetadata, CustomStrategy, StrategyRule } from "../shared/types.js";
import { getStrategies, getStrategy } from "../shared/strategyRegistry.js";
import { logDebug } from "./logger.js";

let customStrategies: CustomStrategy[] = [];

export const setCustomStrategies = (strategies: CustomStrategy[]) => {
    customStrategies = strategies;
};

const COLORS = ["blue", "cyan", "green", "orange", "purple", "red", "yellow"];

export const domainFromUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch (error) {
    logDebug("Failed to parse domain", { url, error: String(error) });
    return "unknown";
  }
};

export const getFieldValue = (tab: TabMetadata, field: string): any => {
    switch(field) {
        case 'id': return tab.id;
        case 'index': return tab.index;
        case 'windowId': return tab.windowId;
        case 'groupId': return tab.groupId;
        case 'title': return tab.title;
        case 'url': return tab.url;
        case 'status': return tab.status;
        case 'active': return tab.active;
        case 'pinned': return tab.pinned;
        case 'openerTabId': return tab.openerTabId;
        case 'lastAccessed': return tab.lastAccessed;
        case 'context': return tab.context;
        case 'genre': return tab.contextData?.genre;
        case 'siteName': return tab.contextData?.siteName;
        // Derived or mapped fields
        case 'domain': return domainFromUrl(tab.url);
        default: return (tab as any)[field];
    }
};

const stripTld = (domain: string): string => {
  return domain.replace(/\.(com|org|gov|net|edu|io)$/i, "");
};

export const semanticBucket = (title: string, url: string): string => {
  const key = `${title} ${url}`.toLowerCase();
  if (key.includes("doc") || key.includes("readme") || key.includes("guide")) return "Docs";
  if (key.includes("mail") || key.includes("inbox")) return "Chat";
  if (key.includes("dashboard") || key.includes("console")) return "Dash";
  if (key.includes("issue") || key.includes("ticket")) return "Tasks";
  if (key.includes("drive") || key.includes("storage")) return "Files";
  return "Misc";
};

export const navigationKey = (tab: TabMetadata): string => {
  if (tab.openerTabId !== undefined) {
    return `child-of-${tab.openerTabId}`;
  }
  return `window-${tab.windowId}`;
};

const getRecencyLabel = (lastAccessed: number): string => {
  const now = Date.now();
  const diff = now - lastAccessed;
  if (diff < 3600000) return "Just now"; // 1h
  if (diff < 86400000) return "Today"; // 24h
  if (diff < 172800000) return "Yesterday"; // 48h
  if (diff < 604800000) return "This Week"; // 7d
  return "Older";
};

const colorForKey = (key: string, offset: number): string => COLORS[(Math.abs(hashCode(key)) + offset) % COLORS.length];

const hashCode = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
};

// Helper to get a human-readable label component from a strategy and a set of tabs
const getLabelComponent = (strategy: GroupingStrategy | string, tabs: TabMetadata[], allTabsMap: Map<number, TabMetadata>): string => {
  const firstTab = tabs[0];
  if (!firstTab) return "Unknown";

  // Check custom strategies first
  const custom = customStrategies.find(s => s.id === strategy);
  if (custom) {
      // For custom strategies, the group key (result of rule) IS the label.
      // But we need to re-evaluate it for the representative tab to be consistent,
      // or just assume the grouping key was correct.
      // Since `generateLabel` is called after grouping, tabs in this group should share the same key.
      return groupingKey(firstTab, strategy);
  }

  switch (strategy) {
    case "domain": {
      // Try to find a common siteName
      const siteNames = new Set(tabs.map(t => t.contextData?.siteName).filter(Boolean));
      if (siteNames.size === 1) {
        return stripTld(Array.from(siteNames)[0] as string);
      }
      // If mixed or missing, fall back to domain
      return stripTld(domainFromUrl(firstTab.url));
    }
    case "domain_full":
      // Return full domain (no TLD stripping)
      return domainFromUrl(firstTab.url);
    case "topic":
      return semanticBucket(firstTab.title, firstTab.url);
    case "lineage":
      if (firstTab.openerTabId !== undefined) {
        const parent = allTabsMap.get(firstTab.openerTabId);
        if (parent) {
          // Truncate parent title if too long
          const parentTitle = parent.title.length > 20 ? parent.title.substring(0, 20) + "..." : parent.title;
          return `From: ${parentTitle}`;
        }
        return `From: Tab ${firstTab.openerTabId}`;
      }
      return `Window ${firstTab.windowId}`;
    case "context":
      // Using context directly as label
      return firstTab.context || "Uncategorized";
    case "pinned":
      return firstTab.pinned ? "Pinned" : "Unpinned";
    case "age":
      return getRecencyLabel(firstTab.lastAccessed ?? 0);
    // For sorting-oriented strategies, we provide a generic label or fallback
    case "url":
      return "URL Group"; // Grouping by full URL is rarely useful, usually 1 tab per group
    case "recency":
      return "Time Group";
    case "nesting":
      return firstTab.openerTabId !== undefined ? "Children" : "Roots";
    default:
      // Check if it matches a generic field
      const val = getFieldValue(firstTab, strategy);
      if (val !== undefined && val !== null) {
          return String(val);
      }
      return "Unknown";
  }
};

const generateLabel = (
  strategies: (GroupingStrategy | string)[],
  tabs: TabMetadata[],
  allTabsMap: Map<number, TabMetadata>
): string => {
  const labels = strategies
    .map(s => getLabelComponent(s, tabs, allTabsMap))
    .filter(l => l && l !== "Unknown" && l !== "Group" && !l.includes("Group"));

  if (labels.length === 0) return "Group";
  return Array.from(new Set(labels)).join(" - ");
};

export const groupTabs = (
  tabs: TabMetadata[],
  strategies: (SortingStrategy | string)[]
): TabGroup[] => {
  // Use getStrategies to check grouping capability dynamically
  const availableStrategies = getStrategies(customStrategies);
  const effectiveStrategies = strategies.filter(s => availableStrategies.find(avail => avail.id === s)?.isGrouping);
  const buckets = new Map<string, TabGroup>();

  // Create a map of all tabs for easy lookup (needed for navigation parent title resolution)
  const allTabsMap = new Map<number, TabMetadata>();
  tabs.forEach(t => allTabsMap.set(t.id, t));

  tabs.forEach((tab) => {
    const keys = effectiveStrategies.map(s => groupingKey(tab, s));
    const bucketKey = `window-${tab.windowId}::` + keys.join("::");

    let group = buckets.get(bucketKey);
    if (!group) {
      group = {
        id: bucketKey,
        windowId: tab.windowId,
        label: "", // Will be set later
        color: colorForKey(bucketKey, buckets.size),
        tabs: [],
        reason: effectiveStrategies.join(" + ")
      };
      buckets.set(bucketKey, group);
    }
    group.tabs.push(tab);
  });

  // After populating buckets, generate labels
  const groups = Array.from(buckets.values());
  groups.forEach(group => {
    group.label = generateLabel(effectiveStrategies, group.tabs, allTabsMap);
  });

  return groups;
};

export const groupingKey = (tab: TabMetadata, strategy: GroupingStrategy | string): string => {
  // 1. Check Custom Strategies (Override built-in if ID matches)
  const custom = customStrategies.find(s => s.id === strategy);
  if (custom) {
      return evaluateRules(custom.rules, tab) || custom.fallback || "Misc";
  }

  // 2. Built-in Strategies
  switch (strategy) {
    case "domain":
    case "domain_full":
      return domainFromUrl(tab.url);
    case "topic":
      return semanticBucket(tab.title, tab.url);
    case "lineage":
      return navigationKey(tab);
    case "context":
      return tab.context || "Uncategorized";
    case "pinned":
      return tab.pinned ? "pinned" : "unpinned";
    case "age":
      return getRecencyLabel(tab.lastAccessed ?? 0);
    // Exact match strategies
    case "url":
      return tab.url;
    case "title":
      return tab.title;
    case "recency":
      return String(tab.lastAccessed ?? 0);
    case "nesting":
      return tab.openerTabId !== undefined ? "child" : "root";
    default:
        // Generic field fallback
        const val = getFieldValue(tab, strategy);
        if (val !== undefined && val !== null) {
            return String(val);
        }
        return "Unknown";
  }
};

const evaluateRules = (rules: StrategyRule[], tab: TabMetadata): string | null => {
    for (const rule of rules) {
        const rawValue = getFieldValue(tab, rule.field);
        let valueToCheck = rawValue !== undefined && rawValue !== null ? String(rawValue) : "";

        // Case-insensitive comparison usually desired for grouping
        valueToCheck = valueToCheck.toLowerCase();
        const pattern = rule.value.toLowerCase();

        switch (rule.operator) {
            case 'contains':
                if (valueToCheck.includes(pattern)) return rule.result;
                break;
            case 'equals':
                if (valueToCheck === pattern) return rule.result;
                break;
            case 'startsWith':
                if (valueToCheck.startsWith(pattern)) return rule.result;
                break;
            case 'endsWith':
                if (valueToCheck.endsWith(pattern)) return rule.result;
                break;
            case 'matches':
                try {
                    const regex = new RegExp(rule.value, 'i'); // Use original casing for regex pattern if needed, but 'i' handles it
                    // Use original raw value for regex to preserve case in capture groups
                    const match = regex.exec(rawValue !== undefined && rawValue !== null ? String(rawValue) : "");
                    if (match) {
                        // Support capture group replacement ($1, $2, etc.)
                        let result = rule.result;
                        for (let i = 1; i < match.length; i++) {
                             result = result.replace(new RegExp(`\\$${i}`, 'g'), match[i] || "");
                        }
                        return result;
                    }
                } catch (e) {
                    // Invalid regex, ignore
                }
                break;
        }
    }
    return null;
};
