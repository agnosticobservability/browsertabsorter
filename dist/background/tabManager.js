import { groupTabs } from "./groupingStrategies.js";
import { sortTabs } from "./sortingStrategies.js";
import { logDebug, logInfo } from "./logger.js";
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
        openerTabId: tab.openerTabId ?? undefined,
        favIconUrl: tab.favIconUrl
    };
};
const enrichTabsWithYoutubeChannel = async (tabs) => {
    const youtubeTabs = tabs.filter((t) => t.url.includes("youtube.com/watch"));
    if (youtubeTabs.length === 0)
        return tabs;
    await Promise.all(youtubeTabs.map(async (tab) => {
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const selector = "ytd-video-owner-renderer #channel-name a, ytd-channel-name a, #owner #channel-name a";
                    const el = document.querySelector(selector);
                    return el?.textContent?.trim() || null;
                }
            });
            if (results && results[0] && results[0].result) {
                tab.youtubeChannel = results[0].result;
            }
        }
        catch (err) {
            // Ignore scripting errors (e.g. if tab is restricted)
        }
    }));
    return tabs;
};
export const fetchTabGroups = async (preferences, filter) => {
    const chromeTabs = await chrome.tabs.query({});
    const windowIdSet = new Set(filter?.windowIds ?? []);
    const tabIdSet = new Set(filter?.tabIds ?? []);
    const hasFilters = windowIdSet.size > 0 || tabIdSet.size > 0;
    const filteredTabs = chromeTabs.filter((tab) => {
        if (!hasFilters)
            return true;
        return (tab.windowId && windowIdSet.has(tab.windowId)) || (tab.id && tabIdSet.has(tab.id));
    });
    let mapped = filteredTabs
        .map(mapChromeTab)
        .filter((tab) => Boolean(tab));
    if (preferences.sorting.includes("youtube-channel")) {
        mapped = await enrichTabsWithYoutubeChannel(mapped);
    }
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
                title: group.label
            });
        }
    }
};
export const applyTabSorting = async (preferences, filter) => {
    const chromeTabs = await chrome.tabs.query({});
    const targetWindowIds = new Set();
    if (!filter || (!filter.windowIds?.length && !filter.tabIds?.length)) {
        chromeTabs.forEach(t => { if (t.windowId)
            targetWindowIds.add(t.windowId); });
    }
    else {
        filter.windowIds?.forEach(id => targetWindowIds.add(id));
        if (filter.tabIds?.length) {
            const ids = new Set(filter.tabIds);
            chromeTabs.forEach(t => {
                if (t.id && ids.has(t.id) && t.windowId)
                    targetWindowIds.add(t.windowId);
            });
        }
    }
    for (const windowId of targetWindowIds) {
        const windowTabs = chromeTabs.filter(t => t.windowId === windowId);
        let mapped = windowTabs.map(mapChromeTab).filter((t) => Boolean(t));
        if (preferences.sorting.includes("youtube-channel")) {
            mapped = await enrichTabsWithYoutubeChannel(mapped);
        }
        const sorted = sortTabs(mapped, preferences.sorting);
        const sortedIds = sorted.map(t => t.id);
        if (sortedIds.length > 0) {
            await chrome.tabs.ungroup(sortedIds);
            await chrome.tabs.move(sortedIds, { index: 0 });
        }
    }
};
export const closeGroup = async (group) => {
    const ids = group.tabs.map((tab) => tab.id);
    await chrome.tabs.remove(ids);
    logDebug("Closed group", { label: group.label, count: ids.length });
};
