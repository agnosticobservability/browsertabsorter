import { groupTabs } from "./groupingStrategies.js";
import { sortTabs } from "./sortingStrategies.js";
import { analyzeTabContext } from "./contextAnalysis.js";
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
    openerTabId: tab.openerTabId ?? undefined,
    favIconUrl: tab.favIconUrl,
    groupId: tab.groupId
  };
};

export const fetchCurrentTabGroups = async (
  preferences: Preferences
): Promise<TabGroup[]> => {
  const tabs = await chrome.tabs.query({});
  const groups = await chrome.tabGroups.query({});
  const groupMap = new Map(groups.map(g => [g.id, g]));

  // Map tabs to metadata
  const mapped = tabs.map(mapChromeTab).filter((t): t is TabMetadata => Boolean(t));

  if (preferences.sorting.includes("context")) {
      const contextMap = await analyzeTabContext(mapped);
      mapped.forEach(tab => {
        const res = contextMap.get(tab.id);
        tab.context = res?.context;
        tab.contextData = res?.data;
      });
  }

  const resultGroups: TabGroup[] = [];
  const tabsByGroupId = new Map<number, TabMetadata[]>();
  const tabsByWindowUngrouped = new Map<number, TabMetadata[]>();

  mapped.forEach(tab => {
      const groupId = tab.groupId ?? -1;
      if (groupId !== -1) {
          if (!tabsByGroupId.has(groupId)) tabsByGroupId.set(groupId, []);
          tabsByGroupId.get(groupId)!.push(tab);
      } else {
           if (!tabsByWindowUngrouped.has(tab.windowId)) tabsByWindowUngrouped.set(tab.windowId, []);
           tabsByWindowUngrouped.get(tab.windowId)!.push(tab);
      }
  });

  // Create TabGroup objects for actual groups
  for (const [groupId, groupTabs] of tabsByGroupId) {
      const browserGroup = groupMap.get(groupId);
      if (browserGroup) {
          resultGroups.push({
              id: `group-${groupId}`,
              windowId: browserGroup.windowId,
              label: browserGroup.title || "Untitled Group",
              color: browserGroup.color,
              tabs: sortTabs(groupTabs, preferences.sorting),
              reason: "Manual"
          });
      }
  }

  // Handle ungrouped tabs
  for (const [windowId, tabs] of tabsByWindowUngrouped) {
      resultGroups.push({
          id: `ungrouped-${windowId}`,
          windowId: windowId,
          label: "Ungrouped",
          color: "grey",
          tabs: sortTabs(tabs, preferences.sorting),
          reason: "Ungrouped"
      });
  }

  // Sort groups might be nice, but TabGroup[] doesn't strictly dictate order in UI (UI sorts by label currently? Or keeps order?)
  // popup.ts sorts groups by label in renderTree: Array.from(groups.entries()).sort()...
  // So order here doesn't matter much.

  logInfo("Fetched current tab groups", { groups: resultGroups.length, tabs: mapped.length });
  return resultGroups;
};

export const calculateTabGroups = async (
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

  if (preferences.sorting.includes("context")) {
    const contextMap = await analyzeTabContext(mapped);
    mapped.forEach(tab => {
      const res = contextMap.get(tab.id);
      tab.context = res?.context;
      tab.contextData = res?.data;
    });
  }

  const grouped = groupTabs(mapped, preferences.sorting);
  grouped.forEach((group) => {
    group.tabs = sortTabs(group.tabs, preferences.sorting);
  });
  logInfo("Calculated tab groups", { groups: grouped.length, tabs: mapped.length });
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

export const applyTabSorting = async (
  preferences: Preferences,
  filter?: GroupingSelection
) => {
  const chromeTabs = await chrome.tabs.query({});

  const targetWindowIds = new Set<number>();

  if (!filter || (!filter.windowIds?.length && !filter.tabIds?.length)) {
      chromeTabs.forEach(t => { if (t.windowId) targetWindowIds.add(t.windowId); });
  } else {
      filter.windowIds?.forEach(id => targetWindowIds.add(id));
      if (filter.tabIds?.length) {
          const ids = new Set(filter.tabIds);
          chromeTabs.forEach(t => {
              if (t.id && ids.has(t.id) && t.windowId) targetWindowIds.add(t.windowId);
          });
      }
  }

  for (const windowId of targetWindowIds) {
      const windowTabs = chromeTabs.filter(t => t.windowId === windowId);
      const mapped = windowTabs.map(mapChromeTab).filter((t): t is TabMetadata => Boolean(t));

      if (preferences.sorting.includes("context")) {
        const contextMap = await analyzeTabContext(mapped);
        mapped.forEach(tab => {
          const res = contextMap.get(tab.id);
          tab.context = res?.context;
          tab.contextData = res?.data;
        });
      }

      // Group tabs by groupId to sort within groups
      const tabsByGroup = new Map<number, TabMetadata[]>();
      const ungroupedTabs: TabMetadata[] = [];

      mapped.forEach(tab => {
        const groupId = tab.groupId ?? -1;
        if (groupId !== -1) {
          const group = tabsByGroup.get(groupId) ?? [];
          group.push(tab);
          tabsByGroup.set(groupId, group);
        } else {
          ungroupedTabs.push(tab);
        }
      });

      // 1. Sort tabs within each group
      for (const [groupId, tabs] of tabsByGroup) {
        const groupTabIndices = windowTabs
          .filter(t => t.groupId === groupId)
          .map(t => t.index)
          .sort((a, b) => a - b);

        const startIndex = groupTabIndices[0] ?? 0;

        const sortedGroupTabs = sortTabs(tabs, preferences.sorting);
        const sortedIds = sortedGroupTabs.map(t => t.id);

        if (sortedIds.length > 0) {
           await chrome.tabs.move(sortedIds, { index: startIndex });
        }
      }

      // 2. Sort ungrouped tabs
      if (ungroupedTabs.length > 0) {
        const sortedUngrouped = sortTabs(ungroupedTabs, preferences.sorting);
        const sortedIds = sortedUngrouped.map(t => t.id);

        // Move to index 0 (top of window)
        await chrome.tabs.move(sortedIds, { index: 0 });
      }
  }
};

export const closeGroup = async (group: TabGroup) => {
  const ids = group.tabs.map((tab) => tab.id);
  await chrome.tabs.remove(ids);
  logDebug("Closed group", { label: group.label, count: ids.length });
};

export const mergeTabs = async (tabIds: number[]) => {
  if (!tabIds.length) return;
  const tabs = await Promise.all(tabIds.map(id => chrome.tabs.get(id).catch(() => null)));
  const validTabs = tabs.filter((t): t is chrome.tabs.Tab => t !== null && t.id !== undefined && t.windowId !== undefined);

  if (validTabs.length === 0) return;

  // Target Window: The one with the most selected tabs, or the first one.
  // Using the first tab's window as the target.
  const targetWindowId = validTabs[0].windowId;

  // 1. Move tabs to target window
  const tabsToMove = validTabs.filter(t => t.windowId !== targetWindowId);
  if (tabsToMove.length > 0) {
    const moveIds = tabsToMove.map(t => t.id!);
    await chrome.tabs.move(moveIds, { windowId: targetWindowId, index: -1 });
  }

  // 2. Group them
  // Check if there is an existing group in the target window that was part of the selection.
  // We prioritize the group of the first tab if it has one.
  const firstTabGroupId = validTabs[0].groupId;
  let targetGroupId: number | undefined;

  if (firstTabGroupId && firstTabGroupId !== -1) {
      // Verify the group is in the target window (it should be, as we picked targetWindowId from validTabs[0])
      // But if validTabs[0] was moved (it wasn't, as it defined the target), it's fine.
      targetGroupId = firstTabGroupId;
  } else {
      // Look for any other group in the selection that is in the target window
      const otherGroup = validTabs.find(t => t.windowId === targetWindowId && t.groupId !== -1);
      if (otherGroup) {
          targetGroupId = otherGroup.groupId;
      }
  }

  const ids = validTabs.map(t => t.id!);
  await chrome.tabs.group({ tabIds: ids, groupId: targetGroupId });
  logInfo("Merged tabs", { count: ids.length, targetWindowId, targetGroupId });
};
