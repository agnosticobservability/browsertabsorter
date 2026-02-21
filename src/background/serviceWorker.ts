import { applyTabGroups, applyTabSorting, calculateTabGroups, fetchCurrentTabGroups, mergeTabs, splitTabs, getTabsByIds } from "./tabManager.js";
import { loadPreferences, savePreferences } from "./preferences.js";
import { setCustomStrategies } from "./groupingStrategies.js";
import { analyzeTabContext } from "./contextAnalysis.js";
import { mapChromeTab } from "../shared/utils.js";
import { logDebug, logInfo, getLogs, clearLogs, setLoggerPreferences, initLogger, addLogEntry, loggerReady } from "../shared/logger.js";
import { pushUndoState, saveState, undo, getSavedStates, deleteSavedState, restoreState } from "./stateManager.js";
import {
  ApplyGroupingPayload,
  GroupingSelection,
  GroupingStrategy,
  Preferences,
  RuntimeMessage,
  RuntimeResponse,
  SortingStrategy,
  TabGroup
} from "../shared/types.js";

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const prefs = await loadPreferences();
    setCustomStrategies(prefs.customStrategies || []);
    logInfo("Extension installed", {
      version: chrome.runtime.getManifest().version,
      logLevel: prefs.logLevel,
      strategiesCount: prefs.customStrategies?.length || 0
    });
  } catch (e) {
    console.error("Install handler failed", e);
  }
});

// Initialize logger on startup
loadPreferences().then(async (prefs) => {
    setCustomStrategies(prefs.customStrategies || []);
    await initLogger();
    logInfo("Service Worker Initialized", {
        version: chrome.runtime.getManifest().version,
        logLevel: prefs.logLevel
    });
}).catch(e => {
    console.error("Service Worker Initialization Failed", e);
});

const handleMessage = async <TData>(
  message: RuntimeMessage,
  sender: chrome.runtime.MessageSender
): Promise<RuntimeResponse<TData>> => {
  logDebug("Received message", { type: message.type, from: sender.id });
  switch (message.type) {
    case "getState": {
      const prefs = await loadPreferences();
      setCustomStrategies(prefs.customStrategies || []);
      // Use fetchCurrentTabGroups to return the actual state of the browser tabs
      const groups = await fetchCurrentTabGroups(prefs);
      return { ok: true, data: { groups, preferences: prefs } as TData };
    }
    case "applyGrouping": {
      logInfo("Applying grouping from message", { sorting: (message.payload as any)?.sorting });
      await pushUndoState();
      const prefs = await loadPreferences();
      setCustomStrategies(prefs.customStrategies || []);
      const payload = (message.payload as ApplyGroupingPayload | undefined) ?? {};
      const selection = payload.selection ?? {};
      const sorting = payload.sorting?.length ? payload.sorting : undefined;

      const preferences = sorting ? { ...prefs, sorting } : prefs;

      const onProgress = (completed: number, total: number) => {
          chrome.runtime.sendMessage({
              type: "groupingProgress",
              payload: { completed, total }
          }).catch(() => {});
      };

      // Use calculateTabGroups to determine the target grouping
      const groups = await calculateTabGroups(preferences, selection, onProgress);
      await applyTabGroups(groups);
      return { ok: true, data: { groups } as TData };
    }
    case "applySorting": {
      logInfo("Applying sorting from message");
      await pushUndoState();
      const prefs = await loadPreferences();
      setCustomStrategies(prefs.customStrategies || []);
      const payload = (message.payload as ApplyGroupingPayload | undefined) ?? {};
      const selection = payload.selection ?? {};
      const sorting = payload.sorting?.length ? payload.sorting : undefined;
      const preferences = sorting ? { ...prefs, sorting } : prefs;

      const onProgress = (completed: number, total: number) => {
          chrome.runtime.sendMessage({
              type: "groupingProgress",
              payload: { completed, total }
          }).catch(() => {});
      };

      await applyTabSorting(preferences, selection, onProgress);
      return { ok: true };
    }
    case "mergeSelection": {
      logInfo("Merging selection from message");
      await pushUndoState();
      const payload = message.payload as { tabIds: number[] };
      if (payload?.tabIds?.length) {
        await mergeTabs(payload.tabIds);
        return { ok: true };
      }
      return { ok: false, error: "No tabs selected" };
    }
    case "splitSelection": {
      logInfo("Splitting selection from message");
      await pushUndoState();
      const payload = message.payload as { tabIds: number[] };
      if (payload?.tabIds?.length) {
        await splitTabs(payload.tabIds);
        return { ok: true };
      }
      return { ok: false, error: "No tabs selected" };
    }
    case "undo": {
      logInfo("Undoing last action");
      await undo();
      return { ok: true };
    }
    case "saveState": {
      const name = (message.payload as any)?.name;
      if (typeof name === "string") {
        logInfo("Saving state from message", { name });
        await saveState(name);
        return { ok: true };
      }
      return { ok: false, error: "Invalid name" };
    }
    case "getSavedStates": {
      const states = await getSavedStates();
      return { ok: true, data: states as TData };
    }
    case "restoreState": {
      const state = (message.payload as any)?.state;
      if (state) {
        logInfo("Restoring state from message", { name: state.name });
        await restoreState(state);
        return { ok: true };
      }
      return { ok: false, error: "Invalid state" };
    }
    case "deleteSavedState": {
      const name = (message.payload as any)?.name;
      if (typeof name === "string") {
        logInfo("Deleting saved state from message", { name });
        await deleteSavedState(name);
        return { ok: true };
      }
      return { ok: false, error: "Invalid name" };
    }
    case "loadPreferences": {
      const prefs = await loadPreferences();
      setCustomStrategies(prefs.customStrategies || []);
      return { ok: true, data: prefs as TData };
    }
    case "savePreferences": {
      logInfo("Saving preferences from message");
      const prefs = await savePreferences(message.payload as any);
      setCustomStrategies(prefs.customStrategies || []);
      setLoggerPreferences(prefs);
      return { ok: true, data: prefs as TData };
    }
    case "getLogs": {
        await loggerReady;
        const logs = getLogs();
        return { ok: true, data: logs as TData };
    }
    case "clearLogs": {
        clearLogs();
        return { ok: true };
    }
    case "logEntry": {
        const entry = message.payload as any;
        if (entry && entry.level && entry.message) {
            addLogEntry(entry);
        }
        return { ok: true };
    }
    case "analyzeTabs": {
        const payload = message.payload as { tabIds: number[] };
        if (payload?.tabIds?.length) {
            try {
                const tabs = await getTabsByIds(payload.tabIds);
                const mapped = tabs.map(mapChromeTab).filter((t): t is import("../shared/types.js").TabMetadata => t !== null);
                const contextMap = await analyzeTabContext(mapped);
                return { ok: true, data: Array.from(contextMap.entries()) as TData };
            } catch (e) {
                return { ok: false, error: String(e) };
            }
        }
        return { ok: false, error: "No tab IDs provided" };
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
    try {
      handleMessage(message, sender)
      .then((response) => sendResponse(response))
      .catch((error) => {
        console.error("Message handling failed", error);
        sendResponse({ ok: false, error: String(error) });
      });
    } catch (e) {
      console.error("Synchronous error in message listener", e);
      sendResponse({ ok: false, error: String(e) });
    }
    return true;
  }
);

chrome.tabGroups.onRemoved.addListener(async (group) => {
  logInfo("Tab group removed", { group });
});

let autoRunTimeout: ReturnType<typeof setTimeout> | null = null;
const dirtyTabIds = new Set<number>();
let tabProcessingTimeout: ReturnType<typeof setTimeout> | null = null;

const triggerAutoRun = (tabId?: number) => {
  // 1. Schedule fast, targeted update for specific tabs
  if (tabId !== undefined) {
    dirtyTabIds.add(tabId);
    if (tabProcessingTimeout) clearTimeout(tabProcessingTimeout);

    tabProcessingTimeout = setTimeout(async () => {
      const ids = Array.from(dirtyTabIds);
      dirtyTabIds.clear();
      if (ids.length === 0) return;

      try {
        const prefs = await loadPreferences();
        setCustomStrategies(prefs.customStrategies || []);

        const autoRunStrats = prefs.customStrategies?.filter(s => s.autoRun);
        if (autoRunStrats && autoRunStrats.length > 0) {
          const strategyIds = autoRunStrats.map(s => s.id);
          // Only process the dirty tabs for quick grouping
          const groups = await calculateTabGroups({ ...prefs, sorting: strategyIds }, { tabIds: ids });
          await applyTabGroups(groups);
          logInfo("Auto-run targeted", { tabs: ids, strategies: strategyIds });
        }
      } catch (e) {
        console.error("Auto-run targeted failed", e);
      }
    }, 200); // Fast debounce for responsiveness
  }

  // 2. Schedule global update (slower debounce) to ensure consistency and sorting
  if (autoRunTimeout) clearTimeout(autoRunTimeout);
  autoRunTimeout = setTimeout(async () => {
    try {
      const prefs = await loadPreferences();
      setCustomStrategies(prefs.customStrategies || []);

      const autoRunStrats = prefs.customStrategies?.filter(s => s.autoRun);
      if (autoRunStrats && autoRunStrats.length > 0) {
        logInfo("Auto-running strategies (global)", {
          strategies: autoRunStrats.map(s => s.id),
          count: autoRunStrats.length
        });
        const ids = autoRunStrats.map(s => s.id);

        // We apply grouping using these strategies
        const groups = await calculateTabGroups({ ...prefs, sorting: ids });
        await applyTabGroups(groups);
      }
    } catch (e) {
      console.error("Auto-run failed", e);
    }
  }, 1000);
};

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id) triggerAutoRun(tab.id);
  else triggerAutoRun();
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    triggerAutoRun(tabId);
  }
});
