import { groupTabs } from "./groupingStrategies.js";
import { sortTabs } from "./sortingStrategies.js";
import { logDebug, logInfo } from "./logger.js";
import { Preferences, TabGroup, TabMetadata } from "../shared/types.js";

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
  windowId?: number
): Promise<TabGroup[]> => {
  const chromeTabs = await chrome.tabs.query(windowId ? { windowId } : {});
  const mapped = chromeTabs
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
        title: group.label,
        color: group.color as chrome.tabGroups.ColorEnum
      });
    }
  }
};

export const closeGroup = async (group: TabGroup) => {
  const ids = group.tabs.map((tab) => tab.id);
  await chrome.tabs.remove(ids);
  logDebug("Closed group", { label: group.label, count: ids.length });
};
