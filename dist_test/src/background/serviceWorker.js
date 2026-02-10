"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tabManager_js_1 = require("./tabManager.js");
const preferences_js_1 = require("./preferences.js");
const groupingStrategies_js_1 = require("./groupingStrategies.js");
const logger_js_1 = require("./logger.js");
const stateManager_js_1 = require("./stateManager.js");
chrome.runtime.onInstalled.addListener(async () => {
    const prefs = await (0, preferences_js_1.loadPreferences)();
    (0, groupingStrategies_js_1.setCustomStrategies)(prefs.customStrategies || []);
    (0, logger_js_1.logInfo)("Extension installed", { prefs });
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
            await (0, stateManager_js_1.pushUndoState)();
            const prefs = await (0, preferences_js_1.loadPreferences)();
            (0, groupingStrategies_js_1.setCustomStrategies)(prefs.customStrategies || []);
            const payload = message.payload ?? {};
            const selection = payload.selection ?? {};
            const sorting = payload.sorting?.length ? payload.sorting : undefined;
            const preferences = sorting ? { ...prefs, sorting } : prefs;
            // Use calculateTabGroups to determine the target grouping
            const groups = await (0, tabManager_js_1.calculateTabGroups)(preferences, selection);
            await (0, tabManager_js_1.applyTabGroups)(groups);
            return { ok: true, data: { groups } };
        }
        case "applySorting": {
            await (0, stateManager_js_1.pushUndoState)();
            const prefs = await (0, preferences_js_1.loadPreferences)();
            (0, groupingStrategies_js_1.setCustomStrategies)(prefs.customStrategies || []);
            const payload = message.payload ?? {};
            const selection = payload.selection ?? {};
            const sorting = payload.sorting?.length ? payload.sorting : undefined;
            const preferences = sorting ? { ...prefs, sorting } : prefs;
            await (0, tabManager_js_1.applyTabSorting)(preferences, selection);
            return { ok: true };
        }
        case "mergeSelection": {
            await (0, stateManager_js_1.pushUndoState)();
            const payload = message.payload;
            if (payload?.tabIds?.length) {
                await (0, tabManager_js_1.mergeTabs)(payload.tabIds);
                return { ok: true };
            }
            return { ok: false, error: "No tabs selected" };
        }
        case "splitSelection": {
            await (0, stateManager_js_1.pushUndoState)();
            const payload = message.payload;
            if (payload?.tabIds?.length) {
                await (0, tabManager_js_1.splitTabs)(payload.tabIds);
                return { ok: true };
            }
            return { ok: false, error: "No tabs selected" };
        }
        case "undo": {
            await (0, stateManager_js_1.undo)();
            return { ok: true };
        }
        case "saveState": {
            const name = message.payload?.name;
            if (typeof name === "string") {
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
                await (0, stateManager_js_1.restoreState)(state);
                return { ok: true };
            }
            return { ok: false, error: "Invalid state" };
        }
        case "deleteSavedState": {
            const name = message.payload?.name;
            if (typeof name === "string") {
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
            const prefs = await (0, preferences_js_1.savePreferences)(message.payload);
            (0, groupingStrategies_js_1.setCustomStrategies)(prefs.customStrategies || []);
            return { ok: true, data: prefs };
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
                (0, logger_js_1.logInfo)("Auto-running strategies", { strategies: autoRunStrats.map(s => s.id) });
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
