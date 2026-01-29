"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitTabs = exports.mergeTabs = exports.closeGroup = exports.applyTabSorting = exports.applyTabGroups = exports.calculateTabGroups = exports.fetchCurrentTabGroups = void 0;
const groupingStrategies_js_1 = require("./groupingStrategies.js");
const sortingStrategies_js_1 = require("./sortingStrategies.js");
const contextAnalysis_js_1 = require("./contextAnalysis.js");
const logger_js_1 = require("./logger.js");
const utils_js_1 = require("../shared/utils.js");
const fetchCurrentTabGroups = async (preferences) => {
    try {
        const tabs = await chrome.tabs.query({});
        const groups = await chrome.tabGroups.query({});
        const groupMap = new Map(groups.map(g => [g.id, g]));
        // Map tabs to metadata
        const mapped = tabs.map(utils_js_1.mapChromeTab).filter((t) => Boolean(t));
        if ((0, groupingStrategies_js_1.requiresContextAnalysis)(preferences.sorting)) {
            const contextMap = await (0, contextAnalysis_js_1.analyzeTabContext)(mapped);
            mapped.forEach(tab => {
                const res = contextMap.get(tab.id);
                tab.context = res?.context;
                tab.contextData = res?.data;
            });
        }
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
        // Sort groups might be nice, but TabGroup[] doesn't strictly dictate order in UI (UI sorts by label currently? Or keeps order?)
        // popup.ts sorts groups by label in renderTree: Array.from(groups.entries()).sort()...
        // So order here doesn't matter much.
        (0, logger_js_1.logInfo)("Fetched current tab groups", { groups: resultGroups.length, tabs: mapped.length });
        return resultGroups;
    }
    catch (e) {
        (0, logger_js_1.logError)("Error in fetchCurrentTabGroups", { error: String(e) });
        throw e;
    }
};
exports.fetchCurrentTabGroups = fetchCurrentTabGroups;
const calculateTabGroups = async (preferences, filter) => {
    const chromeTabs = await chrome.tabs.query({});
    const windowIdSet = new Set(filter?.windowIds ?? []);
    const tabIdSet = new Set(filter?.tabIds ?? []);
    const hasFilters = windowIdSet.size > 0 || tabIdSet.size > 0;
    const filteredTabs = chromeTabs.filter((tab) => {
        if (!hasFilters)
            return true;
        return (tab.windowId && windowIdSet.has(tab.windowId)) || (tab.id && tabIdSet.has(tab.id));
    });
    const mapped = filteredTabs
        .map(utils_js_1.mapChromeTab)
        .filter((tab) => Boolean(tab));
    if ((0, groupingStrategies_js_1.requiresContextAnalysis)(preferences.sorting)) {
        const contextMap = await (0, contextAnalysis_js_1.analyzeTabContext)(mapped);
        mapped.forEach(tab => {
            const res = contextMap.get(tab.id);
            tab.context = res?.context;
            tab.contextData = res?.data;
        });
    }
    const grouped = (0, groupingStrategies_js_1.groupTabs)(mapped, preferences.sorting);
    grouped.forEach((group) => {
        group.tabs = (0, sortingStrategies_js_1.sortTabs)(group.tabs, preferences.sorting);
    });
    (0, logger_js_1.logInfo)("Calculated tab groups", { groups: grouped.length, tabs: mapped.length });
    return grouped;
};
exports.calculateTabGroups = calculateTabGroups;
const VALID_COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
const applyTabGroups = async (groups) => {
    const claimedGroupIds = new Set();
    for (const group of groups) {
        let tabsToProcess = [];
        if (group.windowMode === 'new') {
            if (group.tabs.length > 0) {
                try {
                    const first = group.tabs[0];
                    const win = await chrome.windows.create({ tabId: first.id });
                    const winId = win.id;
                    const others = group.tabs.slice(1).map(t => t.id);
                    if (others.length > 0) {
                        await chrome.tabs.move(others, { windowId: winId, index: -1 });
                    }
                    tabsToProcess.push({ windowId: winId, tabs: group.tabs });
                }
                catch (e) {
                    (0, logger_js_1.logError)("Error creating new window for group", { error: String(e) });
                }
            }
        }
        else if (group.windowMode === 'compound') {
            if (group.tabs.length > 0) {
                // Determine target window (majority wins)
                const counts = new Map();
                group.tabs.forEach(t => counts.set(t.windowId, (counts.get(t.windowId) || 0) + 1));
                let targetWindowId = group.tabs[0].windowId;
                let max = 0;
                for (const [wid, count] of counts) {
                    if (count > max) {
                        max = count;
                        targetWindowId = wid;
                    }
                }
                // Move tabs not in target
                const toMove = group.tabs.filter(t => t.windowId !== targetWindowId).map(t => t.id);
                if (toMove.length > 0) {
                    try {
                        await chrome.tabs.move(toMove, { windowId: targetWindowId, index: -1 });
                    }
                    catch (e) {
                        (0, logger_js_1.logError)("Error moving tabs for compound group", { error: String(e) });
                    }
                }
                tabsToProcess.push({ windowId: targetWindowId, tabs: group.tabs });
            }
        }
        else {
            // Current mode: split by source window
            const map = group.tabs.reduce((acc, tab) => {
                const existing = acc.get(tab.windowId) ?? [];
                existing.push(tab);
                acc.set(tab.windowId, existing);
                return acc;
            }, new Map());
            for (const [wid, t] of map) {
                tabsToProcess.push({ windowId: wid, tabs: t });
            }
        }
        for (const { windowId: targetWinId, tabs } of tabsToProcess) {
            // Find candidate group ID to reuse
            let candidateGroupId;
            const counts = new Map();
            for (const t of tabs) {
                // Only consider groups that were already in this window
                if (t.groupId && t.groupId !== -1 && t.windowId === targetWinId) {
                    counts.set(t.groupId, (counts.get(t.groupId) || 0) + 1);
                }
            }
            // Prioritize the most frequent group ID that hasn't been claimed yet
            const sortedCandidates = Array.from(counts.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([id]) => id);
            for (const id of sortedCandidates) {
                if (!claimedGroupIds.has(id)) {
                    candidateGroupId = id;
                    break;
                }
            }
            let finalGroupId;
            if (candidateGroupId !== undefined) {
                claimedGroupIds.add(candidateGroupId);
                finalGroupId = candidateGroupId;
                // Clean up leftovers and add missing tabs
                try {
                    const existingTabs = await chrome.tabs.query({ groupId: finalGroupId });
                    const existingTabIds = new Set(existingTabs.map(t => t.id));
                    const targetTabIds = new Set(tabs.map(t => t.id));
                    // 1. Ungroup tabs that shouldn't be here
                    const leftovers = existingTabs.filter(t => t.id !== undefined && !targetTabIds.has(t.id));
                    if (leftovers.length > 0) {
                        await chrome.tabs.ungroup(leftovers.map(t => t.id));
                    }
                    // 2. Add only the tabs that aren't already in the group
                    const tabsToAdd = tabs.filter(t => !existingTabIds.has(t.id));
                    if (tabsToAdd.length > 0) {
                        // For new/compound, tabs might have been moved, so we must pass tabIds
                        await chrome.tabs.group({ groupId: finalGroupId, tabIds: tabsToAdd.map(t => t.id) });
                    }
                }
                catch (e) {
                    (0, logger_js_1.logError)("Error managing group reuse", { error: String(e) });
                }
            }
            else {
                // Create new group (default behavior: expanded)
                // Ensure we create it in the target window (if strictly new, tabIds implies window if they are in it)
                // If tabs were just moved, they are in targetWinId.
                // chrome.tabs.group with tabIds will infer window from tabs.
                finalGroupId = await chrome.tabs.group({
                    tabIds: tabs.map(t => t.id),
                    createProperties: { windowId: targetWinId }
                });
                claimedGroupIds.add(finalGroupId);
            }
            const updateProps = {
                title: group.label
            };
            if (VALID_COLORS.includes(group.color)) {
                updateProps.color = group.color;
            }
            await chrome.tabGroups.update(finalGroupId, updateProps);
        }
    }
};
exports.applyTabGroups = applyTabGroups;
const applyTabSorting = async (preferences, filter) => {
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
        const mapped = windowTabs.map(utils_js_1.mapChromeTab).filter((t) => Boolean(t));
        if ((0, groupingStrategies_js_1.requiresContextAnalysis)(preferences.sorting)) {
            const contextMap = await (0, contextAnalysis_js_1.analyzeTabContext)(mapped);
            mapped.forEach(tab => {
                const res = contextMap.get(tab.id);
                tab.context = res?.context;
                tab.contextData = res?.data;
            });
        }
        // Group tabs by groupId to sort within groups
        const tabsByGroup = new Map();
        const ungroupedTabs = [];
        mapped.forEach(tab => {
            const groupId = tab.groupId ?? -1;
            if (groupId !== -1) {
                const group = tabsByGroup.get(groupId) ?? [];
                group.push(tab);
                tabsByGroup.set(groupId, group);
            }
            else {
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
            const sortedGroupTabs = (0, sortingStrategies_js_1.sortTabs)(tabs, preferences.sorting);
            const sortedIds = sortedGroupTabs.map(t => t.id);
            if (sortedIds.length > 0) {
                await chrome.tabs.move(sortedIds, { index: startIndex });
            }
        }
        // 2. Sort ungrouped tabs
        if (ungroupedTabs.length > 0) {
            const sortedUngrouped = (0, sortingStrategies_js_1.sortTabs)(ungroupedTabs, preferences.sorting);
            const sortedIds = sortedUngrouped.map(t => t.id);
            // Move to index 0 (top of window)
            await chrome.tabs.move(sortedIds, { index: 0 });
        }
        // 3. Sort Groups (if enabled)
        await sortGroupsIfEnabled(windowId, preferences.sorting, tabsByGroup);
    }
};
exports.applyTabSorting = applyTabSorting;
const compareBySortingRules = (sortingRulesArg, a, b) => {
    const sortRulesList = (0, utils_js_1.asArray)(sortingRulesArg);
    if (sortRulesList.length === 0)
        return 0;
    try {
        for (const rule of sortRulesList) {
            if (!rule)
                continue;
            const valA = (0, groupingStrategies_js_1.getFieldValue)(a, rule.field);
            const valB = (0, groupingStrategies_js_1.getFieldValue)(b, rule.field);
            let result = 0;
            if (valA < valB)
                result = -1;
            else if (valA > valB)
                result = 1;
            if (result !== 0) {
                return rule.order === "desc" ? -result : result;
            }
        }
    }
    catch (error) {
        (0, logger_js_1.logError)("Error evaluating sorting rules", { error: String(error) });
    }
    return 0;
};
const sortGroupsIfEnabled = async (windowId, sortingPreferences, tabsByGroup) => {
    // Check if any active strategy has sortGroups: true
    const customStrats = (0, groupingStrategies_js_1.getCustomStrategies)();
    let groupSorterStrategy = null;
    for (const id of sortingPreferences) {
        const strategy = customStrats.find(s => s.id === id);
        if (strategy && (strategy.sortGroups || (strategy.groupSortingRules && strategy.groupSortingRules.length > 0))) {
            groupSorterStrategy = strategy;
            break;
        }
    }
    if (!groupSorterStrategy)
        return;
    // Get group details
    const groups = await chrome.tabGroups.query({ windowId });
    if (groups.length <= 1)
        return;
    // We sort groups based on the strategy.
    // Since compareBy expects TabMetadata, we need to create a representative TabMetadata for each group.
    // We'll use the first tab of the group (sorted) as the representative.
    const groupReps = [];
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
        groupReps.sort((a, b) => compareBySortingRules(groupSorterStrategy.groupSortingRules, a.rep, b.rep));
    }
    else {
        groupReps.sort((a, b) => (0, sortingStrategies_js_1.compareBy)(groupSorterStrategy.id, a.rep, b.rep));
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
const closeGroup = async (group) => {
    const ids = group.tabs.map((tab) => tab.id);
    await chrome.tabs.remove(ids);
    (0, logger_js_1.logDebug)("Closed group", { label: group.label, count: ids.length });
};
exports.closeGroup = closeGroup;
const mergeTabs = async (tabIds) => {
    if (!tabIds.length)
        return;
    const tabs = await Promise.all(tabIds.map(id => chrome.tabs.get(id).catch(() => null)));
    const validTabs = tabs.filter((t) => t !== null && t.id !== undefined && t.windowId !== undefined);
    if (validTabs.length === 0)
        return;
    // Target Window: The one with the most selected tabs, or the first one.
    // Using the first tab's window as the target.
    const targetWindowId = validTabs[0].windowId;
    // 1. Move tabs to target window
    const tabsToMove = validTabs.filter(t => t.windowId !== targetWindowId);
    if (tabsToMove.length > 0) {
        const moveIds = tabsToMove.map(t => t.id);
        await chrome.tabs.move(moveIds, { windowId: targetWindowId, index: -1 });
    }
    // 2. Group them
    // Check if there is an existing group in the target window that was part of the selection.
    // We prioritize the group of the first tab if it has one.
    const firstTabGroupId = validTabs[0].groupId;
    let targetGroupId;
    if (firstTabGroupId && firstTabGroupId !== -1) {
        // Verify the group is in the target window (it should be, as we picked targetWindowId from validTabs[0])
        // But if validTabs[0] was moved (it wasn't, as it defined the target), it's fine.
        targetGroupId = firstTabGroupId;
    }
    else {
        // Look for any other group in the selection that is in the target window
        const otherGroup = validTabs.find(t => t.windowId === targetWindowId && t.groupId !== -1);
        if (otherGroup) {
            targetGroupId = otherGroup.groupId;
        }
    }
    const ids = validTabs.map(t => t.id);
    await chrome.tabs.group({ tabIds: ids, groupId: targetGroupId });
    (0, logger_js_1.logInfo)("Merged tabs", { count: ids.length, targetWindowId, targetGroupId });
};
exports.mergeTabs = mergeTabs;
const splitTabs = async (tabIds) => {
    if (tabIds.length === 0)
        return;
    // 1. Validate tabs
    const tabs = await Promise.all(tabIds.map(id => chrome.tabs.get(id).catch(() => null)));
    const validTabs = tabs.filter((t) => t !== null && t.id !== undefined && t.windowId !== undefined);
    if (validTabs.length === 0)
        return;
    // 2. Create new window with the first tab
    const firstTab = validTabs[0];
    const newWindow = await chrome.windows.create({ tabId: firstTab.id });
    // 3. Move remaining tabs to new window
    if (validTabs.length > 1) {
        const remainingTabIds = validTabs.slice(1).map(t => t.id);
        await chrome.tabs.move(remainingTabIds, { windowId: newWindow.id, index: -1 });
    }
    (0, logger_js_1.logInfo)("Split tabs to new window", { count: validTabs.length, newWindowId: newWindow.id });
};
exports.splitTabs = splitTabs;
