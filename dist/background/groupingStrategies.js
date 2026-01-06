import { logDebug } from "./logger.js";
const COLORS = ["blue", "cyan", "green", "orange", "purple", "red", "yellow"];
const domainFromUrl = (url) => {
    try {
        const parsed = new URL(url);
        return parsed.hostname.replace(/^www\./, "");
    }
    catch (error) {
        logDebug("Failed to parse domain", { url, error: String(error) });
        return "unknown";
    }
};
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
const navigationKey = (tab) => {
    if (tab.openerTabId !== undefined) {
        return `child-of-${tab.openerTabId}`;
    }
    return `window-${tab.windowId}`;
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
    switch (strategy) {
        case "domain": {
            // Try to find a common siteName
            const siteNames = new Set(tabs.map(t => t.contextData?.siteName).filter(Boolean));
            if (siteNames.size === 1) {
                return stripTld(Array.from(siteNames)[0]);
            }
            // If mixed or missing, fall back to domain
            return stripTld(domainFromUrl(firstTab.url));
        }
        case "semantic":
            return semanticBucket(firstTab.title, firstTab.url);
        case "navigation":
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
        default:
            return "Unknown";
    }
};
const generateLabel = (primary, secondary, tabs, allTabsMap) => {
    const primaryLabel = getLabelComponent(primary, tabs, allTabsMap);
    if (primary === secondary) {
        return primaryLabel;
    }
    const secondaryLabel = getLabelComponent(secondary, tabs, allTabsMap);
    // If labels are identical, just return one
    if (primaryLabel === secondaryLabel)
        return primaryLabel;
    // Formatting logic: "Primary (Secondary)" looks cleaner than "Primary · Secondary"
    return `${primaryLabel} (${secondaryLabel})`;
};
export const groupTabs = (tabs, primary, secondary) => {
    const buckets = new Map();
    // Create a map of all tabs for easy lookup (needed for navigation parent title resolution)
    const allTabsMap = new Map();
    tabs.forEach(t => allTabsMap.set(t.id, t));
    tabs.forEach((tab) => {
        const primaryKey = groupingKey(tab, primary);
        const secondaryKey = groupingKey(tab, secondary);
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
        group.label = generateLabel(primary, secondary, group.tabs, allTabsMap);
    });
    return groups;
};
const groupingKey = (tab, strategy) => {
    switch (strategy) {
        case "domain":
            return domainFromUrl(tab.url);
        case "semantic":
            return semanticBucket(tab.title, tab.url);
        case "navigation":
            return navigationKey(tab);
        default:
            return "Unknown";
    }
};
