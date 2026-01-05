import { applyTabGroups, applyTabSorting, fetchTabGroups } from "./tabManager.js";
import { loadPreferences, savePreferences } from "./preferences.js";
import { logDebug, logInfo } from "./logger.js";
import { pushUndoState, saveState, undo, getSavedStates, deleteSavedState, restoreState } from "./stateManager.js";
chrome.runtime.onInstalled.addListener(async () => {
    const prefs = await loadPreferences();
    logInfo("Extension installed", { prefs });
});
const handleMessage = async (message, sender) => {
    logDebug("Received message", { type: message.type, from: sender.id });
    switch (message.type) {
        case "getState": {
            const prefs = await loadPreferences();
            const groups = await fetchTabGroups(prefs);
            return { ok: true, data: { groups, preferences: prefs } };
        }
        case "applyGrouping": {
            await pushUndoState();
            const prefs = await loadPreferences();
            const payload = message.payload ?? {};
            const selection = payload.selection ?? {};
            const sorting = payload.sorting?.length ? payload.sorting : undefined;
            const preferences = sorting ? { ...prefs, sorting } : prefs;
            const groups = await fetchTabGroups(preferences, selection);
            await applyTabGroups(groups);
            return { ok: true, data: { groups } };
        }
        case "applySorting": {
            await pushUndoState();
            const prefs = await loadPreferences();
            const payload = message.payload ?? {};
            const selection = payload.selection ?? {};
            const sorting = payload.sorting?.length ? payload.sorting : undefined;
            const preferences = sorting ? { ...prefs, sorting } : prefs;
            await applyTabSorting(preferences, selection);
            return { ok: true };
        }
        case "undo": {
            await undo();
            return { ok: true };
        }
        case "saveState": {
            const name = message.payload?.name;
            if (typeof name === "string") {
                await saveState(name);
                return { ok: true };
            }
            return { ok: false, error: "Invalid name" };
        }
        case "getSavedStates": {
            const states = await getSavedStates();
            return { ok: true, data: states };
        }
        case "restoreState": {
            const state = message.payload?.state;
            if (state) {
                await restoreState(state);
                return { ok: true };
            }
            return { ok: false, error: "Invalid state" };
        }
        case "deleteSavedState": {
            const name = message.payload?.name;
            if (typeof name === "string") {
                await deleteSavedState(name);
                return { ok: true };
            }
            return { ok: false, error: "Invalid name" };
        }
        case "loadPreferences": {
            const prefs = await loadPreferences();
            return { ok: true, data: prefs };
        }
        case "savePreferences": {
            const prefs = await savePreferences(message.payload);
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
    logInfo("Tab group removed", { group });
});
