import { applyTabGroups, fetchTabGroups } from "./tabManager.js";
import { loadPreferences, savePreferences } from "./preferences.js";
import { logDebug, logInfo } from "./logger.js";
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
            const prefs = await loadPreferences();
            const selection = message.payload ?? {};
            const groups = await fetchTabGroups(prefs, selection);
            await applyTabGroups(groups);
            return { ok: true, data: { groups } };
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
chrome.tabs.onCreated.addListener(async (tab) => {
    const prefs = await loadPreferences();
    if (!prefs.autoGroupNewTabs)
        return;
    if (!tab.windowId)
        return;
    const groups = await fetchTabGroups(prefs, { windowIds: [tab.windowId] });
    await applyTabGroups(groups);
});
chrome.tabGroups.onRemoved.addListener(async (group) => {
    logInfo("Tab group removed", { group });
});
