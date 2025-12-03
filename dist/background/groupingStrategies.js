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
const semanticBucket = (title, url) => {
    const key = `${title} ${url}`.toLowerCase();
    if (key.includes("doc") || key.includes("readme") || key.includes("guide"))
        return "Documentation";
    if (key.includes("mail") || key.includes("inbox"))
        return "Communication";
    if (key.includes("dashboard") || key.includes("console"))
        return "Dashboards";
    if (key.includes("issue") || key.includes("ticket"))
        return "Issues";
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
export const groupTabs = (tabs, primary, secondary) => {
    const buckets = new Map();
    tabs.forEach((tab) => {
        const primaryKey = groupingKey(tab, primary);
        const secondaryKey = groupingKey(tab, secondary);
        const bucketKey = `${primaryKey}::${secondaryKey}`;
        const existing = buckets.get(bucketKey);
        if (existing) {
            existing.tabs.push(tab);
        }
        else {
            const label = primaryKey === secondaryKey ? primaryKey : `${primaryKey} · ${secondaryKey}`;
            buckets.set(bucketKey, {
                id: bucketKey,
                label,
                color: colorForKey(bucketKey, buckets.size),
                tabs: [tab],
                reason: `${primary} + ${secondary}`
            });
        }
    });
    return Array.from(buckets.values());
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
