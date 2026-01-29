"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requiresContextAnalysis = exports.groupingKey = exports.checkCondition = exports.groupTabs = exports.navigationKey = exports.semanticBucket = exports.getFieldValue = exports.subdomainFromUrl = exports.domainFromUrl = exports.getCustomStrategies = exports.setCustomStrategies = void 0;
const strategyRegistry_js_1 = require("../shared/strategyRegistry.js");
const logger_js_1 = require("./logger.js");
const utils_js_1 = require("../shared/utils.js");
let customStrategies = [];
const setCustomStrategies = (strategies) => {
    customStrategies = strategies;
};
exports.setCustomStrategies = setCustomStrategies;
const getCustomStrategies = () => customStrategies;
exports.getCustomStrategies = getCustomStrategies;
const COLORS = ["blue", "cyan", "green", "orange", "purple", "red", "yellow"];
const domainFromUrl = (url) => {
    try {
        const parsed = new URL(url);
        return parsed.hostname.replace(/^www\./, "");
    }
    catch (error) {
        (0, logger_js_1.logDebug)("Failed to parse domain", { url, error: String(error) });
        return "unknown";
    }
};
exports.domainFromUrl = domainFromUrl;
const subdomainFromUrl = (url) => {
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
    }
    catch {
        return "";
    }
};
exports.subdomainFromUrl = subdomainFromUrl;
const getFieldValue = (tab, field) => {
    switch (field) {
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
        case 'domain': return (0, exports.domainFromUrl)(tab.url);
        case 'subdomain': return (0, exports.subdomainFromUrl)(tab.url);
        default:
            if (field.includes('.')) {
                return field.split('.').reduce((obj, key) => (obj && typeof obj === 'object' && obj !== null) ? obj[key] : undefined, tab);
            }
            return tab[field];
    }
};
exports.getFieldValue = getFieldValue;
const stripTld = (domain) => {
    return domain.replace(/\.(com|org|gov|net|edu|io)$/i, "");
};
const semanticBucket = (title, url) => {
    const key = `${title} ${url}`.toLowerCase();
    if (key.includes("doc") || key.includes("readme") || key.includes("guide"))
        return "Docs";
    if (key.includes("mail") || key.includes("inbox"))
        return "Chat";
    if (key.includes("dashboard") || key.includes("console"))
        return "Dash";
    if (key.includes("issue") || key.includes("ticket"))
        return "Tasks";
    if (key.includes("drive") || key.includes("storage"))
        return "Files";
    return "Misc";
};
exports.semanticBucket = semanticBucket;
const navigationKey = (tab) => {
    if (tab.openerTabId !== undefined) {
        return `child-of-${tab.openerTabId}`;
    }
    return `window-${tab.windowId}`;
};
exports.navigationKey = navigationKey;
const getRecencyLabel = (lastAccessed) => {
    const now = Date.now();
    const diff = now - lastAccessed;
    if (diff < 3600000)
        return "Just now"; // 1h
    if (diff < 86400000)
        return "Today"; // 24h
    if (diff < 172800000)
        return "Yesterday"; // 48h
    if (diff < 604800000)
        return "This Week"; // 7d
    return "Older";
};
const colorForKey = (key, offset) => COLORS[(Math.abs(hashCode(key)) + offset) % COLORS.length];
const hashCode = (value) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(i);
        hash |= 0;
    }
    return hash;
};
// Helper to get a human-readable label component from a strategy and a set of tabs
const getLabelComponent = (strategy, tabs, allTabsMap) => {
    const firstTab = tabs[0];
    if (!firstTab)
        return "Unknown";
    // Check custom strategies first
    const custom = customStrategies.find(s => s.id === strategy);
    if (custom) {
        return (0, exports.groupingKey)(firstTab, strategy);
    }
    switch (strategy) {
        case "domain": {
            const siteNames = new Set(tabs.map(t => t.contextData?.siteName).filter(Boolean));
            if (siteNames.size === 1) {
                return stripTld(Array.from(siteNames)[0]);
            }
            return stripTld((0, exports.domainFromUrl)(firstTab.url));
        }
        case "domain_full":
            return (0, exports.domainFromUrl)(firstTab.url);
        case "topic":
            return (0, exports.semanticBucket)(firstTab.title, firstTab.url);
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
            const val = (0, exports.getFieldValue)(firstTab, strategy);
            if (val !== undefined && val !== null) {
                return String(val);
            }
            return "Unknown";
    }
};
const generateLabel = (strategies, tabs, allTabsMap) => {
    const labels = strategies
        .map(s => getLabelComponent(s, tabs, allTabsMap))
        .filter(l => l && l !== "Unknown" && l !== "Group" && l !== "URL Group" && l !== "Time Group" && l !== "Misc");
    if (labels.length === 0)
        return "Group";
    return Array.from(new Set(labels)).join(" - ");
};
const getStrategyColor = (strategyId) => {
    const custom = customStrategies.find(s => s.id === strategyId);
    if (!custom)
        return undefined;
    const groupingRulesList = (0, utils_js_1.asArray)(custom.groupingRules);
    // Iterate manually to check color
    for (let i = groupingRulesList.length - 1; i >= 0; i--) {
        const rule = groupingRulesList[i];
        if (rule && rule.color && rule.color !== 'random') {
            return rule.color;
        }
    }
    return undefined;
};
const groupTabs = (tabs, strategies) => {
    const availableStrategies = (0, strategyRegistry_js_1.getStrategies)(customStrategies);
    const effectiveStrategies = strategies.filter(s => availableStrategies.find(avail => avail.id === s)?.isGrouping);
    const buckets = new Map();
    const allTabsMap = new Map();
    tabs.forEach(t => allTabsMap.set(t.id, t));
    tabs.forEach((tab) => {
        let keys = [];
        const appliedStrategies = [];
        try {
            for (const s of effectiveStrategies) {
                const key = (0, exports.groupingKey)(tab, s);
                if (key !== null) {
                    keys.push(`${s}:${key}`);
                    appliedStrategies.push(s);
                }
            }
        }
        catch (e) {
            (0, logger_js_1.logDebug)("Error generating grouping key", { tabId: tab.id, error: String(e) });
            return; // Skip this tab on error
        }
        // If no strategies applied (e.g. all filtered out), skip grouping for this tab
        if (keys.length === 0) {
            return;
        }
        const bucketKey = `window-${tab.windowId}::` + keys.join("::");
        let group = buckets.get(bucketKey);
        if (!group) {
            let groupColor = null;
            for (const sId of appliedStrategies) {
                const color = getStrategyColor(sId);
                if (color) {
                    groupColor = color;
                    break;
                }
            }
            if (!groupColor) {
                groupColor = colorForKey(bucketKey, buckets.size);
            }
            group = {
                id: bucketKey,
                windowId: tab.windowId,
                label: "",
                color: groupColor,
                tabs: [],
                reason: appliedStrategies.join(" + ")
            };
            buckets.set(bucketKey, group);
        }
        group.tabs.push(tab);
    });
    const groups = Array.from(buckets.values());
    groups.forEach(group => {
        // Generate label based on the reason (applied strategies)
        // Actually generateLabel takes a list of strategies.
        // We should pass the strategies that actually formed the group?
        // But different tabs might have different sets of strategies if we allowed partial matches (not the case here,
        // since keys define the bucket, so all tabs in bucket matched the same set of strategies and produced the same keys).
        // The reason field contains the applied strategies joined by ' + '.
        // We can parse it or pass effectiveStrategies and let generateLabel filter out nulls (which it does).
        // But passing effectiveStrategies might include strategies that were filtered out (returned null).
        // getLabelComponent calls groupingKey again. If it returns null, it's filtered.
        // So passing effectiveStrategies is safe and correct.
        group.label = generateLabel(effectiveStrategies, group.tabs, allTabsMap);
    });
    return groups;
};
exports.groupTabs = groupTabs;
const checkCondition = (condition, tab) => {
    if (!condition)
        return false;
    const rawValue = (0, exports.getFieldValue)(tab, condition.field);
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
            }
            catch {
                return false;
            }
        default: return false;
    }
};
exports.checkCondition = checkCondition;
function evaluateLegacyRules(legacyRules, tab) {
    // Defensive check
    if (!legacyRules || !Array.isArray(legacyRules)) {
        if (!legacyRules)
            return null;
        // Try asArray if it's not array but truthy (unlikely given previous logic but safe)
    }
    const legacyRulesList = (0, utils_js_1.asArray)(legacyRules);
    if (legacyRulesList.length === 0)
        return null;
    try {
        for (const rule of legacyRulesList) {
            if (!rule)
                continue;
            const rawValue = (0, exports.getFieldValue)(tab, rule.field);
            let valueToCheck = rawValue !== undefined && rawValue !== null ? String(rawValue) : "";
            valueToCheck = valueToCheck.toLowerCase();
            const pattern = rule.value ? rule.value.toLowerCase() : "";
            let isMatch = false;
            let matchObj = null;
            switch (rule.operator) {
                case 'contains':
                    isMatch = valueToCheck.includes(pattern);
                    break;
                case 'doesNotContain':
                    isMatch = !valueToCheck.includes(pattern);
                    break;
                case 'equals':
                    isMatch = valueToCheck === pattern;
                    break;
                case 'startsWith':
                    isMatch = valueToCheck.startsWith(pattern);
                    break;
                case 'endsWith':
                    isMatch = valueToCheck.endsWith(pattern);
                    break;
                case 'exists':
                    isMatch = rawValue !== undefined;
                    break;
                case 'doesNotExist':
                    isMatch = rawValue === undefined;
                    break;
                case 'isNull':
                    isMatch = rawValue === null;
                    break;
                case 'isNotNull':
                    isMatch = rawValue !== null;
                    break;
                case 'matches':
                    try {
                        const regex = new RegExp(rule.value, 'i');
                        matchObj = regex.exec(rawValue !== undefined && rawValue !== null ? String(rawValue) : "");
                        isMatch = !!matchObj;
                    }
                    catch (e) { }
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
    }
    catch (error) {
        (0, logger_js_1.logDebug)("Error evaluating legacy rules", { error: String(error) });
    }
    return null;
}
const groupingKey = (tab, strategy) => {
    const custom = customStrategies.find(s => s.id === strategy);
    if (custom) {
        const filterGroupsList = (0, utils_js_1.asArray)(custom.filterGroups);
        const filtersList = (0, utils_js_1.asArray)(custom.filters);
        let match = false;
        if (filterGroupsList.length > 0) {
            // OR logic: At least one group must pass
            for (const group of filterGroupsList) {
                const groupRules = (0, utils_js_1.asArray)(group);
                if (groupRules.length === 0 || groupRules.every(r => (0, exports.checkCondition)(r, tab))) {
                    match = true;
                    break;
                }
            }
        }
        else if (filtersList.length > 0) {
            // Legacy/Simple AND logic
            if (filtersList.every(f => (0, exports.checkCondition)(f, tab))) {
                match = true;
            }
        }
        else {
            // No filters -> Match all
            match = true;
        }
        if (!match) {
            return null;
        }
        const groupingRulesList = (0, utils_js_1.asArray)(custom.groupingRules);
        if (groupingRulesList.length > 0) {
            const parts = [];
            try {
                for (const rule of groupingRulesList) {
                    if (!rule)
                        continue;
                    let val = "";
                    if (rule.source === 'field') {
                        const raw = (0, exports.getFieldValue)(tab, rule.value);
                        val = raw !== undefined && raw !== null ? String(raw) : "";
                    }
                    else {
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
                                val = (0, exports.domainFromUrl)(val);
                                break;
                            case 'hostname':
                                try {
                                    val = new URL(val).hostname;
                                }
                                catch { /* keep as is */ }
                                break;
                            case 'regex':
                                if (rule.transformPattern) {
                                    try {
                                        const regex = new RegExp(rule.transformPattern);
                                        const match = regex.exec(val);
                                        if (match) {
                                            let extracted = "";
                                            for (let i = 1; i < match.length; i++) {
                                                extracted += match[i] || "";
                                            }
                                            val = extracted;
                                        }
                                        else {
                                            val = "";
                                        }
                                    }
                                    catch (e) {
                                        (0, logger_js_1.logDebug)("Invalid regex in transform", { pattern: rule.transformPattern, error: String(e) });
                                        val = "";
                                    }
                                }
                                else {
                                    val = "";
                                }
                                break;
                        }
                    }
                    if (val)
                        parts.push(val);
                }
            }
            catch (e) {
                (0, logger_js_1.logDebug)("Error applying grouping rules", { error: String(e) });
            }
            if (parts.length > 0) {
                return parts.join(" - ");
            }
            return custom.fallback || "Misc";
        }
        else if (custom.rules) {
            const result = evaluateLegacyRules((0, utils_js_1.asArray)(custom.rules), tab);
            if (result)
                return result;
        }
        return custom.fallback || "Misc";
    }
    switch (strategy) {
        case "domain":
        case "domain_full":
            return (0, exports.domainFromUrl)(tab.url);
        case "topic":
            return (0, exports.semanticBucket)(tab.title, tab.url);
        case "lineage":
            return (0, exports.navigationKey)(tab);
        case "context":
            return tab.context || "Uncategorized";
        case "pinned":
            return tab.pinned ? "pinned" : "unpinned";
        case "age":
            return getRecencyLabel(tab.lastAccessed ?? 0);
        case "url":
            return tab.url;
        case "title":
            return tab.title;
        case "recency":
            return String(tab.lastAccessed ?? 0);
        case "nesting":
            return tab.openerTabId !== undefined ? "child" : "root";
        default:
            const val = (0, exports.getFieldValue)(tab, strategy);
            if (val !== undefined && val !== null) {
                return String(val);
            }
            return "Unknown";
    }
};
exports.groupingKey = groupingKey;
function isContextField(field) {
    return field === 'context' || field === 'genre' || field === 'siteName' || field.startsWith('contextData.');
}
const requiresContextAnalysis = (strategyIds) => {
    // Check if "context" strategy is explicitly requested
    if (strategyIds.includes("context"))
        return true;
    const strategies = (0, strategyRegistry_js_1.getStrategies)(customStrategies);
    // filter only those that match the requested IDs
    const activeDefs = strategies.filter(s => strategyIds.includes(s.id));
    for (const def of activeDefs) {
        // If it's a built-in strategy that needs context (only 'context' does)
        if (def.id === 'context')
            return true;
        // If it is a custom strategy (or overrides built-in), check its rules
        const custom = customStrategies.find(c => c.id === def.id);
        if (custom) {
            const groupRulesList = (0, utils_js_1.asArray)(custom.groupingRules);
            const sortRulesList = (0, utils_js_1.asArray)(custom.sortingRules);
            const groupSortRulesList = (0, utils_js_1.asArray)(custom.groupSortingRules);
            const filtersList = (0, utils_js_1.asArray)(custom.filters);
            const filterGroupsList = (0, utils_js_1.asArray)(custom.filterGroups);
            for (const rule of groupRulesList) {
                if (rule && rule.source === 'field' && isContextField(rule.value))
                    return true;
            }
            for (const rule of sortRulesList) {
                if (rule && isContextField(rule.field))
                    return true;
            }
            for (const rule of groupSortRulesList) {
                if (rule && isContextField(rule.field))
                    return true;
            }
            for (const rule of filtersList) {
                if (rule && isContextField(rule.field))
                    return true;
            }
            for (const group of filterGroupsList) {
                const groupRules = (0, utils_js_1.asArray)(group);
                for (const rule of groupRules) {
                    if (rule && isContextField(rule.field))
                        return true;
                }
            }
        }
    }
    return false;
};
exports.requiresContextAnalysis = requiresContextAnalysis;
