import { groupTabs, getCustomStrategies, getFieldValue } from "./groupingStrategies.js";
import { sortTabs, compareBy } from "./sortingStrategies.js";
import { analyzeTabContext } from "./contextAnalysis.js";
import { logDebug, logError, logInfo } from "./logger.js";
import { GroupingSelection, Preferences, TabGroup, TabMetadata, SortingRule } from "../shared/types.js";
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
    groupId: tab.groupId,
    index: tab.index,
    active: tab.active,
    status: tab.status
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

const VALID_COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];

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
      const updateProps: chrome.tabGroups.UpdateProperties = {
        title: group.label
      };
      if (VALID_COLORS.includes(group.color)) {
          updateProps.color = group.color as chrome.tabGroups.ColorEnum;
      }
      await chrome.tabGroups.update(groupId, updateProps);
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

      // 3. Sort Groups (if enabled)
      await sortGroupsIfEnabled(windowId, preferences.sorting, tabsByGroup);
  }
};

const compareBySortingRules = (rules: SortingRule[], a: TabMetadata, b: TabMetadata): number => {
  for (const rule of rules) {
    const valA = getFieldValue(a, rule.field);
    const valB = getFieldValue(b, rule.field);

    let result = 0;
    if (valA < valB) result = -1;
    else if (valA > valB) result = 1;

    if (result !== 0) {
      return rule.order === "desc" ? -result : result;
    }
  }

  return 0;
};

const sortGroupsIfEnabled = async (
    windowId: number,
    sortingPreferences: string[],
    tabsByGroup: Map<number, TabMetadata[]>
) => {
    // Check if any active strategy has sortGroups: true
    const customStrats = getCustomStrategies();
    let groupSorterStrategy: ReturnType<typeof customStrats.find> | null = null;

    for (const id of sortingPreferences) {
        const strategy = customStrats.find(s => s.id === id);
        if (strategy && (strategy.sortGroups || (strategy.groupSortingRules && strategy.groupSortingRules.length > 0))) {
            groupSorterStrategy = strategy;
            break;
        }
    }

    if (!groupSorterStrategy) return;

    // Get group details
    const groups = await chrome.tabGroups.query({ windowId });
    if (groups.length <= 1) return;

    // We sort groups based on the strategy.
    // Since compareBy expects TabMetadata, we need to create a representative TabMetadata for each group.
    // We'll use the first tab of the group (sorted) as the representative.

    const groupReps: { group: chrome.tabGroups.TabGroup; rep: TabMetadata }[] = [];

    for (const group of groups) {
        const tabs = tabsByGroup.get(group.id);
        if (tabs && tabs.length > 0) {
            // tabs are already sorted by sortTabs in previous step if that strategy was applied
            // or we just take the first one.
            // Ideally we use the "best" tab.
            // But since we already sorted tabs within groups, tabs[0] is the first one.
            groupReps.push({ group, rep: tabs[0] });
        }
    }

    // Sort the groups
    if (groupSorterStrategy.groupSortingRules && Array.isArray(groupSorterStrategy.groupSortingRules) && groupSorterStrategy.groupSortingRules.length > 0) {
        groupReps.sort((a, b) => compareBySortingRules(groupSorterStrategy.groupSortingRules!, a.rep, b.rep));
    } else {
        groupReps.sort((a, b) => compareBy(groupSorterStrategy!.id, a.rep, b.rep));
    }

    // Apply the order
    // chrome.tabGroups.move(groupId, { index: ... })
    // We want them to be after ungrouped tabs (which are at index 0..N).
    // Actually, chrome.tabGroups.move index is the tab index where the group starts.
    // If we want to strictly order groups, we should calculate the target index.
    // But since groups are contiguous blocks of tabs, we just need to place them in order.

    // Calculate the starting index for groups.
    // Ungrouped tabs are at the start (index 0).
    // So the first group should start after the last ungrouped tab.
    // Wait, earlier we moved ungrouped tabs to index 0.
    // But we need to know how many ungrouped tabs there are in this window.

    // Let's get current tabs again or track count?
    // We can assume ungrouped tabs are at the top.
    // But `tabsByGroup` only contains grouped tabs.
    // We need to know where to start placing groups.
    // The safest way is to move them one by one to the end (or specific index).

    // If we just move them in order to index -1, they will append to the end.
    // If we want them after ungrouped tabs, we need to find the index.

    // Let's use index = -1 to push to end, sequentially.
    // But wait, if we push to end, the order is preserved?
    // No, if we iterate sorted groups and move each to -1, the last one moved will be at the end.
    // So we should iterate in order and move to -1? No, that would reverse them if we consider "end".
    // Actually, if we move Group A to -1, it goes to end. Then Group B to -1, it goes after A.
    // So iterating in sorted order and moving to -1 works to arrange them at the end of the window.

    // However, if there are pinned tabs or ungrouped tabs, they should stay at top?
    // Ungrouped tabs were moved to index 0.
    // Pinned tabs: `chrome.tabs.move` handles pinned constraint (pinned tabs must be first).
    // Groups cannot contain pinned tabs.
    // So groups will be after pinned tabs.
    // If we move to -1, they go to the very end.

    // What if we want them specifically arranged?
    // If we move them sequentially to -1, they will be ordered A, B, C... at the bottom.
    // This seems correct for "sorting groups".

    for (const item of groupReps) {
        await chrome.tabGroups.move(item.group.id, { index: -1 });
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

export const splitTabs = async (tabIds: number[]) => {
  if (tabIds.length === 0) return;

  // 1. Validate tabs
  const tabs = await Promise.all(tabIds.map(id => chrome.tabs.get(id).catch(() => null)));
  const validTabs = tabs.filter((t): t is chrome.tabs.Tab => t !== null && t.id !== undefined && t.windowId !== undefined);

  if (validTabs.length === 0) return;

  // 2. Create new window with the first tab
  const firstTab = validTabs[0];
  const newWindow = await chrome.windows.create({ tabId: firstTab.id });

  // 3. Move remaining tabs to new window
  if (validTabs.length > 1) {
    const remainingTabIds = validTabs.slice(1).map(t => t.id!);
    await chrome.tabs.move(remainingTabIds, { windowId: newWindow.id!, index: -1 });
  }

  logInfo("Split tabs to new window", { count: validTabs.length, newWindowId: newWindow.id });
};
