import { TabGroup, TabMetadata, Preferences } from "../shared/types.js";
import { mapChromeTab, getStoredPreferences } from "../shared/utils.js";
import { setCustomStrategies } from "../background/groupingStrategies.js";
import { sortTabs } from "../background/sortingStrategies.js";

const defaultPreferences: Preferences = {
  sorting: ["pinned", "recency"],
  debug: false,
  theme: "dark"
};

export const fetchLocalState = async () => {
  try {
    const [tabs, groups, prefs] = await Promise.all([
      chrome.tabs.query({}),
      chrome.tabGroups.query({}),
      getStoredPreferences()
    ]);

    const preferences = prefs || defaultPreferences;

    // Initialize custom strategies for sorting
    setCustomStrategies(preferences.customStrategies || []);

    const groupMap = new Map(groups.map(g => [g.id, g]));
    const mapped = tabs.map(mapChromeTab).filter((t): t is TabMetadata => Boolean(t));

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

    console.warn("Fetched local state (fallback)");
    return { ok: true, data: { groups: resultGroups, preferences } };
  } catch (e) {
    console.error("Local state fetch failed:", e);
    return { ok: false, error: String(e) };
  }
};
