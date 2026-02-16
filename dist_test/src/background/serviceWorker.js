"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tabManager_js_1 = require("./tabManager.js");
const preferences_js_1 = require("./preferences.js");
const groupingStrategies_js_1 = require("./groupingStrategies.js");
const logger_js_1 = require("../shared/logger.js");
const stateManager_js_1 = require("./stateManager.js");
chrome.runtime.onInstalled.addListener(async () => {
    const prefs = await (0, preferences_js_1.loadPreferences)();
    (0, groupingStrategies_js_1.setCustomStrategies)(prefs.customStrategies || []);
    (0, logger_js_1.logInfo)("Extension installed", {
        version: chrome.runtime.getManifest().version,
        logLevel: prefs.logLevel,
        strategiesCount: prefs.customStrategies?.length || 0
    });
});
// Initialize logger on startup
(0, preferences_js_1.loadPreferences)().then(async (prefs) => {
    (0, groupingStrategies_js_1.setCustomStrategies)(prefs.customStrategies || []);
    await (0, logger_js_1.initLogger)();
    (0, logger_js_1.logInfo)("Service Worker Initialized", {
        version: chrome.runtime.getManifest().version,
        logLevel: prefs.logLevel
    });
});
const handleMessage = async (message, sender) => {
    (0, logger_js_1.logDebug)("Received message", { type: message.type, from: sender.id });
    switch (message.type) {
        case "getState": {
            const prefs = await (0, preferences_js_1.loadPreferences)();
            (0, groupingStrategies_js_1.setCustomStrategies)(prefs.customStrategies || []);
            // Use fetchCurrentTabGroups to return the actual state of the browser tabs
            const groups = await (0, tabManager_js_1.fetchCurrentTabGroups)(prefs);
            return { ok: true, data: { groups, preferences: prefs } };
        }
        case "applyGrouping": {
            (0, logger_js_1.logInfo)("Applying grouping from message", { sorting: message.payload?.sorting });
            await (0, stateManager_js_1.pushUndoState)();
            const prefs = await (0, preferences_js_1.loadPreferences)();
            (0, groupingStrategies_js_1.setCustomStrategies)(prefs.customStrategies || []);
            const payload = message.payload ?? {};
            const selection = payload.selection ?? {};
            const sorting = payload.sorting?.length ? payload.sorting : undefined;
            const preferences = sorting ? { ...prefs, sorting } : prefs;
            const onProgress = (completed, total) => {
                chrome.runtime.sendMessage({
                    type: "groupingProgress",
                    payload: { completed, total }
                }).catch(() => { });
            };
            // Use calculateTabGroups to determine the target grouping
            const groups = await (0, tabManager_js_1.calculateTabGroups)(preferences, selection, onProgress);
            await (0, tabManager_js_1.applyTabGroups)(groups);
            return { ok: true, data: { groups } };
        }
        case "applySorting": {
            (0, logger_js_1.logInfo)("Applying sorting from message");
            await (0, stateManager_js_1.pushUndoState)();
            const prefs = await (0, preferences_js_1.loadPreferences)();
            (0, groupingStrategies_js_1.setCustomStrategies)(prefs.customStrategies || []);
            const payload = message.payload ?? {};
            const selection = payload.selection ?? {};
            const sorting = payload.sorting?.length ? payload.sorting : undefined;
            const preferences = sorting ? { ...prefs, sorting } : prefs;
            const onProgress = (completed, total) => {
                chrome.runtime.sendMessage({
                    type: "groupingProgress",
                    payload: { completed, total }
                }).catch(() => { });
            };
            await (0, tabManager_js_1.applyTabSorting)(preferences, selection, onProgress);
            return { ok: true };
        }
        case "mergeSelection": {
            (0, logger_js_1.logInfo)("Merging selection from message");
            await (0, stateManager_js_1.pushUndoState)();
            const payload = message.payload;
            if (payload?.tabIds?.length) {
                await (0, tabManager_js_1.mergeTabs)(payload.tabIds);
                return { ok: true };
            }
            return { ok: false, error: "No tabs selected" };
        }
        case "splitSelection": {
            (0, logger_js_1.logInfo)("Splitting selection from message");
            await (0, stateManager_js_1.pushUndoState)();
            const payload = message.payload;
            if (payload?.tabIds?.length) {
                await (0, tabManager_js_1.splitTabs)(payload.tabIds);
                return { ok: true };
            }
            return { ok: false, error: "No tabs selected" };
        }
        case "undo": {
            (0, logger_js_1.logInfo)("Undoing last action");
            await (0, stateManager_js_1.undo)();
            return { ok: true };
        }
        case "saveState": {
            const name = message.payload?.name;
            if (typeof name === "string") {
                (0, logger_js_1.logInfo)("Saving state from message", { name });
                await (0, stateManager_js_1.saveState)(name);
                return { ok: true };
            }
            return { ok: false, error: "Invalid name" };
        }
        case "getSavedStates": {
            const states = await (0, stateManager_js_1.getSavedStates)();
            return { ok: true, data: states };
        }
        case "restoreState": {
            const state = message.payload?.state;
            if (state) {
                (0, logger_js_1.logInfo)("Restoring state from message", { name: state.name });
                await (0, stateManager_js_1.restoreState)(state);
                return { ok: true };
            }
            return { ok: false, error: "Invalid state" };
        }
        case "deleteSavedState": {
            const name = message.payload?.name;
            if (typeof name === "string") {
                (0, logger_js_1.logInfo)("Deleting saved state from message", { name });
                await (0, stateManager_js_1.deleteSavedState)(name);
                return { ok: true };
            }
            return { ok: false, error: "Invalid name" };
        }
        case "loadPreferences": {
            const prefs = await (0, preferences_js_1.loadPreferences)();
            (0, groupingStrategies_js_1.setCustomStrategies)(prefs.customStrategies || []);
            return { ok: true, data: prefs };
        }
        case "savePreferences": {
            (0, logger_js_1.logInfo)("Saving preferences from message");
            const prefs = await (0, preferences_js_1.savePreferences)(message.payload);
            (0, groupingStrategies_js_1.setCustomStrategies)(prefs.customStrategies || []);
            (0, logger_js_1.setLoggerPreferences)(prefs);
            return { ok: true, data: prefs };
        }
        case "getLogs": {
            await logger_js_1.loggerReady;
            const logs = (0, logger_js_1.getLogs)();
            return { ok: true, data: logs };
        }
        case "clearLogs": {
            (0, logger_js_1.clearLogs)();
            return { ok: true };
        }
        case "logEntry": {
            const entry = message.payload;
            if (entry && entry.level && entry.message) {
                (0, logger_js_1.addLogEntry)(entry);
            }
            return { ok: true };
        }
        default:
            return { ok: false, error: "Unknown message" };
    }
};
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender)
        .then((response) => sendResponse(response))
        .catch((error) => {
        sendResponse({ ok: false, error: String(error) });
    });
    return true;
});
chrome.tabGroups.onRemoved.addListener(async (group) => {
    (0, logger_js_1.logInfo)("Tab group removed", { group });
});
let autoRunTimeout = null;
const triggerAutoRun = () => {
    if (autoRunTimeout)
        clearTimeout(autoRunTimeout);
    autoRunTimeout = setTimeout(async () => {
        try {
            const prefs = await (0, preferences_js_1.loadPreferences)();
            (0, groupingStrategies_js_1.setCustomStrategies)(prefs.customStrategies || []);
            const autoRunStrats = prefs.customStrategies?.filter(s => s.autoRun);
            if (autoRunStrats && autoRunStrats.length > 0) {
                (0, logger_js_1.logInfo)("Auto-running strategies", {
                    strategies: autoRunStrats.map(s => s.id),
                    count: autoRunStrats.length
                });
                const ids = autoRunStrats.map(s => s.id);
                // We apply grouping using these strategies
                const groups = await (0, tabManager_js_1.calculateTabGroups)({ ...prefs, sorting: ids });
                await (0, tabManager_js_1.applyTabGroups)(groups);
            }
        }
        catch (e) {
            console.error("Auto-run failed", e);
        }
    }, 1000);
};
chrome.tabs.onCreated.addListener(() => triggerAutoRun());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
        triggerAutoRun();
    }
});
