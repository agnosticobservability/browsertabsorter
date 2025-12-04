import { groupTabs } from "./groupingStrategies.js";
import { sortTabs } from "./sortingStrategies.js";
import { logDebug, logError, logInfo } from "./logger.js";
import { getStoredValue, setStoredValue } from "./storage.js";
const SESSIONS_KEY = "sessions";
const mapChromeTab = (tab) => {
    if (!tab.id || !tab.windowId || !tab.url || !tab.title)
        return null;
    return {
        id: tab.id,
        windowId: tab.windowId,
        title: tab.title,
        url: tab.url,
        pinned: Boolean(tab.pinned),
        lastAccessed: tab.lastAccessed,
        openerTabId: tab.openerTabId ?? undefined
    };
};
export const fetchTabGroups = async (preferences, windowId) => {
    const chromeTabs = await chrome.tabs.query(windowId ? { windowId } : {});
    const mapped = chromeTabs
        .map(mapChromeTab)
        .filter((tab) => Boolean(tab));
    const grouped = groupTabs(mapped, preferences.primaryGrouping, preferences.secondaryGrouping);
    grouped.forEach((group) => {
        group.tabs = sortTabs(group.tabs, preferences.sorting);
    });
    logInfo("Grouped tabs", { groups: grouped.length, tabs: mapped.length });
    return grouped;
};
export const applyTabGroups = async (groups) => {
    for (const group of groups) {
        const tabsByWindow = group.tabs.reduce((acc, tab) => {
            const existing = acc.get(tab.windowId) ?? [];
            existing.push(tab);
            acc.set(tab.windowId, existing);
            return acc;
        }, new Map());
        for (const tabs of tabsByWindow.values()) {
            const groupId = await chrome.tabs.group({ tabIds: tabs.map((t) => t.id) });
            await chrome.tabGroups.update(groupId, {
                title: group.label,
                color: group.color
            });
        }
    }
};
export const saveSession = async (name, groups) => {
    const existing = (await getStoredValue(SESSIONS_KEY)) ?? [];
    const session = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        name,
        groups
    };
    await setStoredValue(SESSIONS_KEY, [...existing, session]);
    logInfo("Saved session", { name, count: groups.length });
    return session;
};
export const listSessions = async () => {
    return (await getStoredValue(SESSIONS_KEY)) ?? [];
};
export const restoreSession = async (session) => {
    try {
        for (const group of session.groups) {
            const tabs = await Promise.all(group.tabs.map((tab) => chrome.tabs.create({ url: tab.url, pinned: tab.pinned })));
            const tabIds = tabs.map((tab) => tab.id).filter(Boolean);
            const groupId = await chrome.tabs.group({ tabIds });
            await chrome.tabGroups.update(groupId, { title: group.label, color: group.color });
        }
    }
    catch (error) {
        logError("Failed to restore session", { error: String(error) });
    }
};
export const closeGroup = async (group) => {
    const ids = group.tabs.map((tab) => tab.id);
    await chrome.tabs.remove(ids);
    logDebug("Closed group", { label: group.label, count: ids.length });
};
