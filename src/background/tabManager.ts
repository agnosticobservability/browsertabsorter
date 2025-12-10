import { groupTabs } from "./groupingStrategies.js";
import { sortTabs } from "./sortingStrategies.js";
import { logDebug, logError, logInfo } from "./logger.js";
import { GroupingSelection, Preferences, TabGroup, TabMetadata } from "../shared/types.js";
import { getStoredValue, setStoredValue } from "./storage.js";

const mapChromeTab = (tab: chrome.tabs.Tab): TabMetadata | null => {
  if (!tab.id || !tab.windowId || !tab.url || !tab.title) return null;
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

export const fetchTabGroups = async (
  preferences: Preferences,
  filter?: GroupingSelection
): Promise<TabGroup[]> => {
  const chromeTabs = await chrome.tabs.query({});
  const windowIdSet = new Set(filter?.windowIds ?? []);
  const tabIdSet = new Set(filter?.tabIds ?? []);
  const hasFilters = windowIdSet.size > 0 || tabIdSet.size > 0;
  const filteredTabs = chromeTabs.filter((tab) => {
    if (!hasFilters) return true;
    return (tab.windowId && windowIdSet.has(tab.windowId)) || (tab.id && tabIdSet.has(tab.id));
  });
  const mapped = filteredTabs
    .map(mapChromeTab)
    .filter((tab): tab is TabMetadata => Boolean(tab));
  const grouped = groupTabs(mapped, preferences.primaryGrouping, preferences.secondaryGrouping);
  grouped.forEach((group) => {
    group.tabs = sortTabs(group.tabs, preferences.sorting);
  });
  logInfo("Grouped tabs", { groups: grouped.length, tabs: mapped.length });
  return grouped;
};

export const applyTabGroups = async (groups: TabGroup[]) => {
  for (const group of groups) {
    const tabsByWindow = group.tabs.reduce<Map<number, TabMetadata[]>>((acc, tab) => {
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

export const closeGroup = async (group: TabGroup) => {
  const ids = group.tabs.map((tab) => tab.id);
  await chrome.tabs.remove(ids);
  logDebug("Closed group", { label: group.label, count: ids.length });
};
