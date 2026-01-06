import { CustomGroupingStrategy, GroupingStrategy, TabGroup, TabMetadata } from "../shared/types.js";
import { logDebug } from "./logger.js";

const COLORS = ["blue", "cyan", "green", "orange", "purple", "red", "yellow"];

const domainFromUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch (error) {
    logDebug("Failed to parse domain", { url, error: String(error) });
    return "unknown";
  }
};

const stripTld = (domain: string): string => {
  return domain.replace(/\.(com|org|gov|net|edu|io)$/i, "");
};

const semanticBucket = (title: string, url: string): string => {
  const key = `${title} ${url}`.toLowerCase();
  if (key.includes("doc") || key.includes("readme") || key.includes("guide")) return "Docs";
  if (key.includes("mail") || key.includes("inbox")) return "Chat";
  if (key.includes("dashboard") || key.includes("console")) return "Dash";
  if (key.includes("issue") || key.includes("ticket")) return "Tasks";
  if (key.includes("drive") || key.includes("storage")) return "Files";
  return "Misc";
};

const navigationKey = (tab: TabMetadata): string => {
  if (tab.openerTabId !== undefined) {
    return `child-of-${tab.openerTabId}`;
  }
  return `window-${tab.windowId}`;
};

const evaluateCustomStrategy = (tab: TabMetadata, strategyId: string, customStrategies: CustomGroupingStrategy[]): string => {
  const strategy = customStrategies.find(s => s.id === strategyId);
  if (!strategy) return "Unknown";

  for (const rule of strategy.rules) {
    let match = false;
    switch (rule.type) {
      case "domain":
        try {
          const domain = new URL(tab.url).hostname;
          if (domain.includes(rule.pattern)) match = true;
        } catch { /* ignore */ }
        break;
      case "url-contains":
        if (tab.url.includes(rule.pattern)) match = true;
        break;
      case "title-contains":
        if (tab.title.includes(rule.pattern)) match = true;
        break;
      case "regex":
        try {
          // Rule pattern string might look like "/pattern/flags" or just "pattern"
          // For simplicity, let's assume it's just the regex body, case insensitive by default, or the user provides flags?
          // Since it's user provided string, we should use a simplified approach or parse it.
          // Let's assume just a standard regex constructor for now.
          const re = new RegExp(rule.pattern, "i");
          if (re.test(tab.url) || re.test(tab.title)) match = true;
        } catch (e) {
          logDebug("Invalid regex in rule", { pattern: rule.pattern, error: String(e) });
        }
        break;
    }

    if (match) return rule.target;
  }
  return "Unmatched";
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

const groupingKey = (tab: TabMetadata, strategy: GroupingStrategy, customStrategies: CustomGroupingStrategy[]): string => {
  switch (strategy) {
    case "url":
      return domainFromUrl(tab.url);
    case "title":
      return semanticBucket(tab.title, tab.url);
    case "hierarchy":
      return navigationKey(tab);
    case "context":
      return tab.context || "Uncategorized";
    default:
      // Check custom strategies
      return evaluateCustomStrategy(tab, strategy, customStrategies);
  }
};

// Helper to get a human-readable label component from a strategy and a set of tabs
const getLabelComponent = (
  strategy: GroupingStrategy,
  tabs: TabMetadata[],
  allTabsMap: Map<number, TabMetadata>,
  customStrategies: CustomGroupingStrategy[]
): string => {
  const firstTab = tabs[0];
  if (!firstTab) return "Unknown";

  switch (strategy) {
    case "url": {
      // Try to find a common siteName
      const siteNames = new Set(tabs.map(t => t.contextData?.siteName).filter(Boolean));
      if (siteNames.size === 1) {
        return stripTld(Array.from(siteNames)[0] as string);
      }
      // If mixed or missing, fall back to domain
      return stripTld(domainFromUrl(firstTab.url));
    }
    case "title":
      return semanticBucket(firstTab.title, firstTab.url);
    case "hierarchy":
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
    default:
      // For custom strategies, the groupingKey already returns the target group name.
      // So we can re-evaluate the key or just use what we have.
      return evaluateCustomStrategy(firstTab, strategy, customStrategies);
  }
};

const generateLabel = (
  primary: GroupingStrategy,
  secondary: GroupingStrategy,
  tabs: TabMetadata[],
  allTabsMap: Map<number, TabMetadata>,
  customStrategies: CustomGroupingStrategy[]
): string => {
  const primaryLabel = getLabelComponent(primary, tabs, allTabsMap, customStrategies);

  if (primary === secondary) {
    return primaryLabel;
  }

  const secondaryLabel = getLabelComponent(secondary, tabs, allTabsMap, customStrategies);

  // If labels are identical, just return one
  if (primaryLabel === secondaryLabel) return primaryLabel;

  // Formatting logic: "Primary (Secondary)" looks cleaner than "Primary · Secondary"
  return `${primaryLabel} (${secondaryLabel})`;
};

export const groupTabs = (
  tabs: TabMetadata[],
  primary: GroupingStrategy,
  secondary: GroupingStrategy,
  customStrategies: CustomGroupingStrategy[] = []
): TabGroup[] => {
  const buckets = new Map<string, TabGroup>();

  // Create a map of all tabs for easy lookup (needed for navigation parent title resolution)
  const allTabsMap = new Map<number, TabMetadata>();
  tabs.forEach(t => allTabsMap.set(t.id, t));

  tabs.forEach((tab) => {
    const primaryKey = groupingKey(tab, primary, customStrategies);
    const secondaryKey = groupingKey(tab, secondary, customStrategies);
    const bucketKey = `window-${tab.windowId}::${primaryKey}::${secondaryKey}`;

    let group = buckets.get(bucketKey);
    if (!group) {
      group = {
        id: bucketKey,
        windowId: tab.windowId,
        label: "", // Will be set later
        color: colorForKey(bucketKey, buckets.size),
        tabs: [],
        reason: `${primary} + ${secondary}`
      };
      buckets.set(bucketKey, group);
    }
    group.tabs.push(tab);
  });

  // After populating buckets, generate labels
  const groups = Array.from(buckets.values());
  groups.forEach(group => {
    group.label = generateLabel(primary, secondary, group.tabs, allTabsMap, customStrategies);
  });

  return groups;
};
