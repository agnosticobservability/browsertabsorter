"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asArray = exports.getStoredPreferences = exports.mapChromeTab = void 0;
const mapChromeTab = (tab) => {
    if (!tab.id || !tab.windowId)
        return null;
    return {
        id: tab.id,
        windowId: tab.windowId,
        title: tab.title || "Untitled",
        url: tab.url || "about:blank",
        pinned: Boolean(tab.pinned),
        lastAccessed: tab.lastAccessed,
        openerTabId: tab.openerTabId ?? undefined,
        favIconUrl: tab.favIconUrl,
        groupId: tab.groupId,
        index: tab.index,
        active: tab.active,
        status: tab.status,
        selected: tab.highlighted
    };
};
exports.mapChromeTab = mapChromeTab;
const getStoredPreferences = async () => {
    return new Promise((resolve) => {
        chrome.storage.local.get("preferences", (items) => {
            resolve(items["preferences"] ?? null);
        });
    });
};
exports.getStoredPreferences = getStoredPreferences;
const asArray = (value) => {
    if (Array.isArray(value))
        return value;
    return [];
};
exports.asArray = asArray;
