import { Preferences, SortingStrategy, TabMetadata } from "./types.js";

export const mapChromeTab = (tab: chrome.tabs.Tab): TabMetadata | null => {
  if (!tab.id || tab.id === chrome.tabs.TAB_ID_NONE || !tab.windowId) return null;
  return {
    id: tab.id,
    windowId: tab.windowId,
    title: tab.title || "Untitled",
    url: tab.pendingUrl || tab.url || "about:blank",
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

export const getStoredPreferences = async (): Promise<Preferences | null> => {
  return new Promise((resolve) => {
    chrome.storage.local.get("preferences", (items) => {
      if (chrome.runtime.lastError) {
        console.error("Storage error (prefs):", chrome.runtime.lastError);
        resolve(null);
        return;
      }
      resolve((items?.["preferences"] as Preferences) ?? null);
    });
  });
};

export const asArray = <T>(value: unknown): T[] => {
    if (Array.isArray(value)) return value as T[];
    return [];
};

export function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
