import { GroupingStrategy, SortingStrategy, TabGroup, TabMetadata, CustomStrategy, StrategyRule, RuleCondition, GroupingRule, SortingRule } from "../shared/types.js";
import { getStrategies } from "../shared/strategyRegistry.js";
import { logDebug } from "../shared/logger.js";
import { asArray } from "../shared/utils.js";

let customStrategies: CustomStrategy[] = [];

export const setCustomStrategies = (strategies: CustomStrategy[]) => {
    customStrategies = strategies;
};

export const getCustomStrategies = (): CustomStrategy[] => customStrategies;

const COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];

const regexCache = new Map<string, RegExp>();

export const domainFromUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch (error) {
    logDebug("Failed to parse domain", { url, error: String(error) });
    return "unknown";
  }
};

export const subdomainFromUrl = (url: string): string => {
    try {
        const parsed = new URL(url);
        let hostname = parsed.hostname;
        // Remove www.
        hostname = hostname.replace(/^www\./, "");

        const parts = hostname.split('.');
        if (parts.length > 2) {
             return parts.slice(0, parts.length - 2).join('.');
        }
        return "";
    } catch {
        return "";
    }
}

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
        case 'selected': return tab.selected;
        case 'pinned': return tab.pinned;
        case 'openerTabId': return tab.openerTabId;
        case 'lastAccessed': return tab.lastAccessed;
        case 'context': return tab.context;
        case 'genre': return tab.contextData?.genre;
        case 'siteName': return tab.contextData?.siteName;
        // Derived or mapped fields
        case 'domain': return domainFromUrl(tab.url);
        case 'subdomain': return subdomainFromUrl(tab.url);
        default:
            if (field.includes('.')) {
                 return field.split('.').reduce((obj, key) => (obj && typeof obj === 'object' && obj !== null) ? (obj as any)[key] : undefined, tab);
            }
            return (tab as any)[field];
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
const getLabelComponent = (strategy: GroupingStrategy | string, tabs: TabMetadata[], allTabsMap: Map<number, TabMetadata>): string | null => {
  const firstTab = tabs[0];
  if (!firstTab) return "Unknown";

  // Check custom strategies first
  const custom = customStrategies.find(s => s.id === strategy);
  if (custom) {
      return groupingKey(firstTab, strategy);
  }

  switch (strategy) {
    case "domain": {
      const siteNames = new Set(tabs.map(t => t.contextData?.siteName).filter(Boolean));
      if (siteNames.size === 1) {
        return stripTld(Array.from(siteNames)[0] as string);
      }
      return stripTld(domainFromUrl(firstTab.url));
    }
    case "domain_full":
      return domainFromUrl(firstTab.url);
    case "topic":
      return semanticBucket(firstTab.title, firstTab.url);
    case "lineage":
      if (firstTab.openerTabId !== undefined) {
        const parent = allTabsMap.get(firstTab.openerTabId);
        if (parent) {
          const parentTitle = parent.title.length > 20 ? parent.title.substring(0, 20) + "..." : parent.title;
          return `From: ${parentTitle}`;
        }
        return `From: Tab ${firstTab.openerTabId}`;
      }
      return `Window ${firstTab.windowId}`;
    case "context":
      return firstTab.context || "Uncategorized";
    case "pinned":
      return firstTab.pinned ? "Pinned" : "Unpinned";
    case "age":
      return getRecencyLabel(firstTab.lastAccessed ?? 0);
    case "url":
      return "URL Group";
    case "recency":
      return "Time Group";
    case "nesting":
      return firstTab.openerTabId !== undefined ? "Children" : "Roots";
    default:
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
    .filter(l => l && l !== "Unknown" && l !== "Group" && l !== "URL Group" && l !== "Time Group" && l !== "Misc");

  if (labels.length === 0) return "Group";
  return Array.from(new Set(labels)).join(" - ");
};

const getStrategyColor = (strategyId: string): string | undefined => {
    const custom = customStrategies.find(s => s.id === strategyId);
    if (!custom) return undefined;

    const groupingRulesList = asArray<GroupingRule>(custom.groupingRules);
    // Iterate manually to check color
    for (let i = groupingRulesList.length - 1; i >= 0; i--) {
        const rule = groupingRulesList[i];
        if (rule && rule.color && rule.color !== 'random') {
            return rule.color;
        }
    }
    return undefined;
};

const resolveWindowMode = (modes: (string | undefined)[]): "current" | "new" | "compound" => {
    if (modes.includes("new")) return "new";
    if (modes.includes("compound")) return "compound";
    return "current";
};

export const groupTabs = (
  tabs: TabMetadata[],
  strategies: (SortingStrategy | string)[]
): TabGroup[] => {
  const availableStrategies = getStrategies(customStrategies);
  const effectiveStrategies = strategies.filter(s => availableStrategies.find(avail => avail.id === s)?.isGrouping);
  const buckets = new Map<string, TabGroup>();

  const allTabsMap = new Map<number, TabMetadata>();
  tabs.forEach(t => allTabsMap.set(t.id, t));

  tabs.forEach((tab) => {
    let keys: string[] = [];
    const appliedStrategies: string[] = [];
    const collectedModes: string[] = [];

    try {
        for (const s of effectiveStrategies) {
            const result = getGroupingResult(tab, s);
            if (result.key !== null) {
                keys.push(`${s}:${result.key}`);
                appliedStrategies.push(s);
                collectedModes.push(result.mode);
            }
        }
    } catch (e) {
        logDebug("Error generating grouping key", { tabId: tab.id, error: String(e) });
        return; // Skip this tab on error
    }

    // If no strategies applied (e.g. all filtered out), skip grouping for this tab
    if (keys.length === 0) {
        return;
    }

    const effectiveMode = resolveWindowMode(collectedModes);
    const valueKey = keys.join("::");
    let bucketKey = "";
    if (effectiveMode === 'current') {
         bucketKey = `window-${tab.windowId}::` + valueKey;
    } else {
         bucketKey = `global::` + valueKey;
    }

    let group = buckets.get(bucketKey);
    if (!group) {
      let groupColor = null;
      for (const sId of appliedStrategies) {
        const color = getStrategyColor(sId);
        if (color) { groupColor = color; break; }
      }

      if (groupColor === 'match') {
        groupColor = colorForKey(valueKey, 0);
      } else if (!groupColor) {
        groupColor = colorForKey(bucketKey, buckets.size);
      }

      group = {
        id: bucketKey,
        windowId: tab.windowId,
        label: "",
        color: groupColor,
        tabs: [],
        reason: appliedStrategies.join(" + "),
        windowMode: effectiveMode
      };
      buckets.set(bucketKey, group);
    }
    group.tabs.push(tab);
  });

  const groups = Array.from(buckets.values());
  groups.forEach(group => {
    group.label = generateLabel(effectiveStrategies, group.tabs, allTabsMap);
  });

  return groups;
};

export const checkCondition = (condition: RuleCondition, tab: TabMetadata): boolean => {
    if (!condition) return false;
    const rawValue = getFieldValue(tab, condition.field);
    const valueToCheck = rawValue !== undefined && rawValue !== null ? String(rawValue).toLowerCase() : "";
    const pattern = condition.value ? condition.value.toLowerCase() : "";

    switch (condition.operator) {
        case 'contains': return valueToCheck.includes(pattern);
        case 'doesNotContain': return !valueToCheck.includes(pattern);
        case 'equals': return valueToCheck === pattern;
        case 'startsWith': return valueToCheck.startsWith(pattern);
        case 'endsWith': return valueToCheck.endsWith(pattern);
        case 'exists': return rawValue !== undefined;
        case 'doesNotExist': return rawValue === undefined;
        case 'isNull': return rawValue === null;
        case 'isNotNull': return rawValue !== null;
        case 'matches':
             try {
                return new RegExp(condition.value, 'i').test(rawValue !== undefined && rawValue !== null ? String(rawValue) : "");
             } catch { return false; }
        default: return false;
    }
};

function evaluateLegacyRules(legacyRules: StrategyRule[], tab: TabMetadata): string | null {
    // Defensive check
    if (!legacyRules || !Array.isArray(legacyRules)) {
        if (!legacyRules) return null;
        // Try asArray if it's not array but truthy (unlikely given previous logic but safe)
    }

    const legacyRulesList = asArray<StrategyRule>(legacyRules);
    if (legacyRulesList.length === 0) return null;

    try {
        for (const rule of legacyRulesList) {
            if (!rule) continue;
            const rawValue = getFieldValue(tab, rule.field);
            let valueToCheck = rawValue !== undefined && rawValue !== null ? String(rawValue) : "";
            valueToCheck = valueToCheck.toLowerCase();
            const pattern = rule.value ? rule.value.toLowerCase() : "";

            let isMatch = false;
            let matchObj: RegExpExecArray | null = null;

            switch (rule.operator) {
                case 'contains': isMatch = valueToCheck.includes(pattern); break;
                case 'doesNotContain': isMatch = !valueToCheck.includes(pattern); break;
                case 'equals': isMatch = valueToCheck === pattern; break;
                case 'startsWith': isMatch = valueToCheck.startsWith(pattern); break;
                case 'endsWith': isMatch = valueToCheck.endsWith(pattern); break;
                case 'exists': isMatch = rawValue !== undefined; break;
                case 'doesNotExist': isMatch = rawValue === undefined; break;
                case 'isNull': isMatch = rawValue === null; break;
                case 'isNotNull': isMatch = rawValue !== null; break;
                case 'matches':
                    try {
                        const regex = new RegExp(rule.value, 'i');
                        matchObj = regex.exec(rawValue !== undefined && rawValue !== null ? String(rawValue) : "");
                        isMatch = !!matchObj;
                    } catch (e) {}
                    break;
            }

            if (isMatch) {
                let result = rule.result;
                if (matchObj) {
                    for (let i = 1; i < matchObj.length; i++) {
                         result = result.replace(new RegExp(`\\$${i}`, 'g'), matchObj[i] || "");
                    }
                }
                return result;
            }
        }
    } catch (error) {
        logDebug("Error evaluating legacy rules", { error: String(error) });
    }
    return null;
}

export const getGroupingResult = (tab: TabMetadata, strategy: GroupingStrategy | string): { key: string | null, mode: "current" | "new" | "compound" } => {
  const custom = customStrategies.find(s => s.id === strategy);
  if (custom) {
      const filterGroupsList = asArray<RuleCondition[]>(custom.filterGroups);
      const filtersList = asArray<RuleCondition>(custom.filters);

      let match = false;

      if (filterGroupsList.length > 0) {
          // OR logic
          for (const group of filterGroupsList) {
              const groupRules = asArray<RuleCondition>(group);
              if (groupRules.length === 0 || groupRules.every(r => checkCondition(r, tab))) {
                  match = true;
                  break;
              }
          }
      } else if (filtersList.length > 0) {
          // Legacy/Simple AND logic
          if (filtersList.every(f => checkCondition(f, tab))) {
              match = true;
          }
      } else {
          // No filters -> Match all
          match = true;
      }

      if (!match) {
          return { key: null, mode: "current" };
      }

      const groupingRulesList = asArray<GroupingRule>(custom.groupingRules);
      if (groupingRulesList.length > 0) {
          const parts: string[] = [];
          const modes: string[] = [];
          try {
            for (const rule of groupingRulesList) {
                if (!rule) continue;
                let val = "";
                if (rule.source === 'field') {
                     const raw = getFieldValue(tab, rule.value);
                     val = raw !== undefined && raw !== null ? String(raw) : "";
                } else {
                     val = rule.value;
                }

                if (val && rule.transform && rule.transform !== 'none') {
                    switch (rule.transform) {
                        case 'stripTld':
                            val = stripTld(val);
                            break;
                        case 'lowercase':
                            val = val.toLowerCase();
                            break;
                        case 'uppercase':
                            val = val.toUpperCase();
                            break;
                        case 'firstChar':
                            val = val.charAt(0);
                            break;
                        case 'domain':
                            val = domainFromUrl(val);
                            break;
                        case 'hostname':
                            try {
                              val = new URL(val).hostname;
                            } catch { /* keep as is */ }
                            break;
                        case 'regex':
                            if (rule.transformPattern) {
                                try {
                                    let regex = regexCache.get(rule.transformPattern);
                                    if (!regex) {
                                        regex = new RegExp(rule.transformPattern);
                                        regexCache.set(rule.transformPattern, regex);
                                    }
                                    const match = regex.exec(val);
                                    if (match) {
                                        let extracted = "";
                                        for (let i = 1; i < match.length; i++) {
                                            extracted += match[i] || "";
                                        }
                                        val = extracted;
                                    } else {
                                        val = "";
                                    }
                                } catch (e) {
                                    logDebug("Invalid regex in transform", { pattern: rule.transformPattern, error: String(e) });
                                    val = "";
                                }
                            } else {
                                val = "";
                            }
                            break;
                    }
                }

                if (val) {
                    parts.push(val);
                    if (rule.windowMode) modes.push(rule.windowMode);
                }
            }
          } catch (e) {
             logDebug("Error applying grouping rules", { error: String(e) });
          }

          if (parts.length > 0) {
              return { key: parts.join(" - "), mode: resolveWindowMode(modes) };
          }
          return { key: custom.fallback || "Misc", mode: "current" };
      } else if (custom.rules) {
          const result = evaluateLegacyRules(asArray<StrategyRule>(custom.rules), tab);
          if (result) return { key: result, mode: "current" };
      }

      return { key: custom.fallback || "Misc", mode: "current" };
  }

  // Built-in strategies
  let simpleKey: string | null = null;
  switch (strategy) {
    case "domain":
    case "domain_full":
      simpleKey = domainFromUrl(tab.url);
      break;
    case "topic":
      simpleKey = semanticBucket(tab.title, tab.url);
      break;
    case "lineage":
      simpleKey = navigationKey(tab);
      break;
    case "context":
      simpleKey = tab.context || "Uncategorized";
      break;
    case "pinned":
      simpleKey = tab.pinned ? "pinned" : "unpinned";
      break;
    case "age":
      simpleKey = getRecencyLabel(tab.lastAccessed ?? 0);
      break;
    case "url":
      simpleKey = tab.url;
      break;
    case "title":
      simpleKey = tab.title;
      break;
    case "recency":
      simpleKey = String(tab.lastAccessed ?? 0);
      break;
    case "nesting":
      simpleKey = tab.openerTabId !== undefined ? "child" : "root";
      break;
    default:
        const val = getFieldValue(tab, strategy);
        if (val !== undefined && val !== null) {
            simpleKey = String(val);
        } else {
            simpleKey = "Unknown";
        }
        break;
  }
  return { key: simpleKey, mode: "current" };
};

export const groupingKey = (tab: TabMetadata, strategy: GroupingStrategy | string): string | null => {
    return getGroupingResult(tab, strategy).key;
};

function isContextField(field: string): boolean {
    return field === 'context' || field === 'genre' || field === 'siteName' || field.startsWith('contextData.');
}

export const requiresContextAnalysis = (strategyIds: (string | SortingStrategy)[]): boolean => {
    // Check if "context" strategy is explicitly requested
    if (strategyIds.includes("context")) return true;

    const strategies = getStrategies(customStrategies);
    // filter only those that match the requested IDs
    const activeDefs = strategies.filter(s => strategyIds.includes(s.id));

    for (const def of activeDefs) {
        // If it's a built-in strategy that needs context (only 'context' does)
        if (def.id === 'context') return true;

        // If it is a custom strategy (or overrides built-in), check its rules
        const custom = customStrategies.find(c => c.id === def.id);
        if (custom) {
             const groupRulesList = asArray<GroupingRule>(custom.groupingRules);
             const sortRulesList = asArray<SortingRule>(custom.sortingRules);
             const groupSortRulesList = asArray<SortingRule>(custom.groupSortingRules);
             const filtersList = asArray<RuleCondition>(custom.filters);
             const filterGroupsList = asArray<RuleCondition[]>(custom.filterGroups);

             for (const rule of groupRulesList) {
                 if (rule && rule.source === 'field' && isContextField(rule.value)) return true;
             }

             for (const rule of sortRulesList) {
                 if (rule && isContextField(rule.field)) return true;
             }

             for (const rule of groupSortRulesList) {
                 if (rule && isContextField(rule.field)) return true;
             }

             for (const rule of filtersList) {
                 if (rule && isContextField(rule.field)) return true;
             }

             for (const group of filterGroupsList) {
                 const groupRules = asArray<RuleCondition>(group);
                 for (const rule of groupRules) {
                     if (rule && isContextField(rule.field)) return true;
                 }
             }
        }
    }
    return false;
};
