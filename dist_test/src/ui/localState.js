"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchLocalState = void 0;
const utils_js_1 = require("../shared/utils.js");
const groupingStrategies_js_1 = require("../background/groupingStrategies.js");
const sortingStrategies_js_1 = require("../background/sortingStrategies.js");
const defaultPreferences = {
    sorting: ["pinned", "recency"],
    debug: false,
    theme: "dark",
    customGenera: {}
};
const fetchLocalState = async () => {
    try {
        const [tabs, groups, prefs] = await Promise.all([
            chrome.tabs.query({}),
            chrome.tabGroups.query({}),
            (0, utils_js_1.getStoredPreferences)()
        ]);
        const preferences = prefs || defaultPreferences;
        // Initialize custom strategies for sorting
        (0, groupingStrategies_js_1.setCustomStrategies)(preferences.customStrategies || []);
        const groupMap = new Map(groups.map(g => [g.id, g]));
        const mapped = tabs.map(utils_js_1.mapChromeTab).filter((t) => Boolean(t));
        const resultGroups = [];
        const tabsByGroupId = new Map();
        const tabsByWindowUngrouped = new Map();
        mapped.forEach(tab => {
            const groupId = tab.groupId ?? -1;
            if (groupId !== -1) {
                if (!tabsByGroupId.has(groupId))
                    tabsByGroupId.set(groupId, []);
                tabsByGroupId.get(groupId).push(tab);
            }
            else {
                if (!tabsByWindowUngrouped.has(tab.windowId))
                    tabsByWindowUngrouped.set(tab.windowId, []);
                tabsByWindowUngrouped.get(tab.windowId).push(tab);
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
                    tabs: (0, sortingStrategies_js_1.sortTabs)(groupTabs, preferences.sorting),
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
                tabs: (0, sortingStrategies_js_1.sortTabs)(tabs, preferences.sorting),
                reason: "Ungrouped"
            });
        }
        console.warn("Fetched local state (fallback)");
        return { ok: true, data: { groups: resultGroups, preferences } };
    }
    catch (e) {
        console.error("Local state fetch failed:", e);
        return { ok: false, error: String(e) };
    }
};
exports.fetchLocalState = fetchLocalState;
