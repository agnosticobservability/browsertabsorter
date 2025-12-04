import { applyTabGroups, fetchTabGroups, listSessions, saveSession } from "./tabManager.js";
import { loadPreferences, savePreferences } from "./preferences.js";
import { logDebug, logInfo } from "./logger.js";
import { RuntimeMessage, RuntimeResponse, TabGroup } from "../shared/types.js";

chrome.runtime.onInstalled.addListener(async () => {
  const prefs = await loadPreferences();
  logInfo("Extension installed", { prefs });
});

const handleMessage = async <TData>(
  message: RuntimeMessage,
  sender: chrome.runtime.MessageSender
): Promise<RuntimeResponse<TData>> => {
  logDebug("Received message", { type: message.type, from: sender.id });
  switch (message.type) {
    case "getState": {
      const prefs = await loadPreferences();
      const groups = await fetchTabGroups(prefs);
      return { ok: true, data: { groups, preferences: prefs } as TData };
    }
    case "applyGrouping": {
      const prefs = await loadPreferences();
      const groups = await fetchTabGroups(prefs);
      await applyTabGroups(groups);
      return { ok: true, data: { groups } as TData };
    }
    case "saveSession": {
      const payload = message.payload as { name: string; groups: TabGroup[] };
      const session = await saveSession(payload.name, payload.groups);
      return { ok: true, data: session as TData };
    }
    case "listSessions": {
      const sessions = await listSessions();
      return { ok: true, data: sessions as TData };
    }
    case "loadPreferences": {
      const prefs = await loadPreferences();
      return { ok: true, data: prefs as TData };
    }
    case "savePreferences": {
      const prefs = await savePreferences(message.payload as any);
      return { ok: true, data: prefs as TData };
    }
    default:
      return { ok: false, error: "Unknown message" };
  }
};

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: RuntimeResponse) => void
  ) => {
    handleMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch((error) => {
      sendResponse({ ok: false, error: String(error) });
    });
    return true;
  }
);

chrome.tabs.onCreated.addListener(async (tab) => {
  const prefs = await loadPreferences();
  if (!prefs.autoGroupNewTabs) return;
  if (!tab.windowId) return;
  const groups = await fetchTabGroups(prefs, tab.windowId);
  await applyTabGroups(groups);
});

chrome.tabGroups.onRemoved.addListener(async (group) => {
  logInfo("Tab group removed", { group });
});
