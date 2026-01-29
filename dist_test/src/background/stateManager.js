"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.restoreState = exports.undo = exports.deleteSavedState = exports.getSavedStates = exports.saveState = exports.pushUndoState = exports.captureCurrentState = void 0;
const storage_js_1 = require("./storage.js");
const logger_js_1 = require("./logger.js");
const MAX_UNDO_STACK = 10;
const UNDO_STACK_KEY = "undoStack";
const SAVED_STATES_KEY = "savedStates";
const captureCurrentState = async () => {
    const windows = await chrome.windows.getAll({ populate: true });
    const windowStates = [];
    for (const win of windows) {
        if (!win.tabs)
            continue;
        const tabStates = win.tabs.map((tab) => {
            let groupTitle;
            let groupColor;
            // Note: tab.groupId is -1 if not grouped.
            return {
                id: tab.id,
                url: tab.url || "",
                pinned: Boolean(tab.pinned),
                groupId: tab.groupId,
                groupTitle, // Will need to fetch if grouped
                groupColor,
            };
        });
        // Populate group info if needed
        // We do this in a second pass to batch or just individually if needed.
        // Actually, we can get group info from chrome.tabGroups.
        // However, the tab object doesn't have the group title directly.
        // Optimization: Get all groups first.
        windowStates.push({ tabs: tabStates });
    }
    // Enrich with group info
    const allGroups = await chrome.tabGroups.query({});
    const groupMap = new Map(allGroups.map(g => [g.id, g]));
    for (const win of windowStates) {
        for (const tab of win.tabs) {
            if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
                const g = groupMap.get(tab.groupId);
                if (g) {
                    tab.groupTitle = g.title;
                    tab.groupColor = g.color;
                }
            }
        }
    }
    return {
        timestamp: Date.now(),
        windows: windowStates,
    };
};
exports.captureCurrentState = captureCurrentState;
const pushUndoState = async () => {
    const state = await (0, exports.captureCurrentState)();
    const stack = (await (0, storage_js_1.getStoredValue)(UNDO_STACK_KEY)) || [];
    stack.push(state);
    if (stack.length > MAX_UNDO_STACK) {
        stack.shift();
    }
    await (0, storage_js_1.setStoredValue)(UNDO_STACK_KEY, stack);
    (0, logger_js_1.logInfo)("Pushed undo state", { stackSize: stack.length });
};
exports.pushUndoState = pushUndoState;
const saveState = async (name) => {
    const undoState = await (0, exports.captureCurrentState)();
    const savedState = {
        name,
        timestamp: undoState.timestamp,
        windows: undoState.windows,
    };
    const savedStates = (await (0, storage_js_1.getStoredValue)(SAVED_STATES_KEY)) || [];
    savedStates.push(savedState);
    await (0, storage_js_1.setStoredValue)(SAVED_STATES_KEY, savedStates);
    (0, logger_js_1.logInfo)("Saved state", { name });
};
exports.saveState = saveState;
const getSavedStates = async () => {
    return (await (0, storage_js_1.getStoredValue)(SAVED_STATES_KEY)) || [];
};
exports.getSavedStates = getSavedStates;
const deleteSavedState = async (name) => {
    let savedStates = (await (0, storage_js_1.getStoredValue)(SAVED_STATES_KEY)) || [];
    savedStates = savedStates.filter(s => s.name !== name);
    await (0, storage_js_1.setStoredValue)(SAVED_STATES_KEY, savedStates);
    (0, logger_js_1.logInfo)("Deleted saved state", { name });
};
exports.deleteSavedState = deleteSavedState;
const undo = async () => {
    const stack = (await (0, storage_js_1.getStoredValue)(UNDO_STACK_KEY)) || [];
    const state = stack.pop();
    if (!state) {
        (0, logger_js_1.logInfo)("Undo stack empty");
        return;
    }
    await (0, storage_js_1.setStoredValue)(UNDO_STACK_KEY, stack);
    await (0, exports.restoreState)(state);
    (0, logger_js_1.logInfo)("Undid last action");
};
exports.undo = undo;
const restoreState = async (state) => {
    // Strategy:
    // 1. Ungroup all tabs (optional, but cleaner).
    // 2. Move tabs to correct windows and indices.
    // 3. Re-group tabs.
    // We need to match current tabs to stored tabs.
    // Priority: ID match -> URL match.
    const currentTabs = await chrome.tabs.query({});
    const currentTabMap = new Map();
    const currentUrlMap = new Map(); // URL -> list of tabs
    currentTabs.forEach(t => {
        if (t.id)
            currentTabMap.set(t.id, t);
        if (t.url) {
            const list = currentUrlMap.get(t.url) || [];
            list.push(t);
            currentUrlMap.set(t.url, list);
        }
    });
    // Helper to find a tab (async to allow creation)
    const findOrCreateTab = async (stored) => {
        // Try ID
        if (stored.id && currentTabMap.has(stored.id)) {
            const t = currentTabMap.get(stored.id);
            currentTabMap.delete(stored.id); // Consume
            // Also remove from url map to avoid double usage
            if (t?.url) {
                const list = currentUrlMap.get(t.url);
                if (list) {
                    const idx = list.findIndex(x => x.id === t.id);
                    if (idx !== -1)
                        list.splice(idx, 1);
                }
            }
            return t;
        }
        // Try URL
        const list = currentUrlMap.get(stored.url);
        if (list && list.length > 0) {
            const t = list.shift();
            if (t?.id)
                currentTabMap.delete(t.id); // Consume
            return t;
        }
        // Create if missing
        if (stored.url) {
            try {
                const t = await chrome.tabs.create({ url: stored.url, active: false });
                return t;
            }
            catch (e) {
                (0, logger_js_1.logError)("Failed to create tab", { url: stored.url, error: e });
            }
        }
        return undefined;
    };
    // We need to reconstruct windows.
    // Ideally, we map state windows to current windows.
    // But strictly, we can just move tabs.
    // For simplicity, let's assume we use existing windows as much as possible.
    // Or create new ones if we run out?
    // Let's iterate stored windows.
    const currentWindows = await chrome.windows.getAll();
    for (let i = 0; i < state.windows.length; i++) {
        const winState = state.windows[i];
        // Identify all tabs for this window first.
        // We do this BEFORE creating a window to avoid creating empty windows.
        const tabsToMove = [];
        for (const storedTab of winState.tabs) {
            const found = await findOrCreateTab(storedTab);
            if (found && found.id) {
                tabsToMove.push({ tabId: found.id, stored: storedTab });
            }
        }
        if (tabsToMove.length === 0)
            continue;
        let targetWindowId;
        if (i < currentWindows.length) {
            targetWindowId = currentWindows[i].id;
        }
        else {
            // Create new window
            const win = await chrome.windows.create({});
            targetWindowId = win.id;
            // Note: New window creation adds a tab. We might want to remove it later or ignore it.
        }
        const tabIds = tabsToMove.map(t => t.tabId);
        // Move all to window.
        // Note: If we move to index 0, they will be prepended.
        // We should probably just move them to the window first.
        // If we move them individually to correct index, it's safer.
        for (let j = 0; j < tabsToMove.length; j++) {
            const { tabId, stored } = tabsToMove[j];
            try {
                await chrome.tabs.move(tabId, { windowId: targetWindowId, index: j });
                if (stored.pinned) {
                    await chrome.tabs.update(tabId, { pinned: true });
                }
                else {
                    // If currently pinned but shouldn't be
                    const current = await chrome.tabs.get(tabId);
                    if (current.pinned)
                        await chrome.tabs.update(tabId, { pinned: false });
                }
            }
            catch (e) {
                (0, logger_js_1.logError)("Failed to move tab", { tabId, error: e });
            }
        }
        // Handle Groups
        // Identify groups in this window
        const groups = new Map(); // title+color -> tabIds
        const groupColors = new Map();
        for (const item of tabsToMove) {
            if (item.stored.groupTitle !== undefined) {
                // Use title as key (or unique ID if we had one, but we don't persist group IDs)
                // Group ID in storage is ephemeral. Title is key.
                const key = item.stored.groupTitle;
                const list = groups.get(key) || [];
                list.push(item.tabId);
                groups.set(key, list);
                if (item.stored.groupColor) {
                    groupColors.set(key, item.stored.groupColor);
                }
            }
            else {
                // Ungroup if needed
                await chrome.tabs.ungroup(item.tabId);
            }
        }
        for (const [title, ids] of groups.entries()) {
            if (ids.length > 0) {
                const groupId = await chrome.tabs.group({ tabIds: ids });
                await chrome.tabGroups.update(groupId, {
                    title: title,
                    color: groupColors.get(title) || "grey"
                });
            }
        }
    }
};
exports.restoreState = restoreState;
