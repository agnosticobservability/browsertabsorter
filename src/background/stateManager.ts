import { UndoState, SavedState, WindowState, StoredTabState } from "../shared/types.js";
import { getStoredValue, setStoredValue } from "./storage.js";
import { logInfo, logError } from "../shared/logger.js";

const MAX_UNDO_STACK = 10;
const UNDO_STACK_KEY = "undoStack";
const SAVED_STATES_KEY = "savedStates";

export const captureCurrentState = async (): Promise<UndoState> => {
  const windows = await chrome.windows.getAll({ populate: true });
  const windowStates: WindowState[] = [];

  for (const win of windows) {
    if (!win.tabs) continue;
    const tabStates: StoredTabState[] = win.tabs.map((tab) => {
      let groupTitle: string | undefined;
      let groupColor: string | undefined;
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

export const pushUndoState = async () => {
  const state = await captureCurrentState();
  const stack = (await getStoredValue<UndoState[]>(UNDO_STACK_KEY)) || [];
  stack.push(state);
  if (stack.length > MAX_UNDO_STACK) {
    stack.shift();
  }
  await setStoredValue(UNDO_STACK_KEY, stack);
  logInfo("Pushed undo state", { stackSize: stack.length });
};

export const saveState = async (name: string) => {
  const undoState = await captureCurrentState();
  const savedState: SavedState = {
    name,
    timestamp: undoState.timestamp,
    windows: undoState.windows,
  };
  const savedStates = (await getStoredValue<SavedState[]>(SAVED_STATES_KEY)) || [];
  savedStates.push(savedState);
  await setStoredValue(SAVED_STATES_KEY, savedStates);
  logInfo("Saved state", { name });
};

export const getSavedStates = async (): Promise<SavedState[]> => {
  return (await getStoredValue<SavedState[]>(SAVED_STATES_KEY)) || [];
};

export const deleteSavedState = async (name: string) => {
  let savedStates = (await getStoredValue<SavedState[]>(SAVED_STATES_KEY)) || [];
  savedStates = savedStates.filter(s => s.name !== name);
  await setStoredValue(SAVED_STATES_KEY, savedStates);
  logInfo("Deleted saved state", { name });
};

export const undo = async () => {
  const stack = (await getStoredValue<UndoState[]>(UNDO_STACK_KEY)) || [];
  const state = stack.pop();
  if (!state) {
    logInfo("Undo stack empty");
    return;
  }
  await setStoredValue(UNDO_STACK_KEY, stack);
  await restoreState(state);
  logInfo("Undid last action");
};

export const restoreState = async (state: UndoState | SavedState) => {
  // Strategy:
  // 1. Ungroup all tabs (optional, but cleaner).
  // 2. Move tabs to correct windows and indices.
  // 3. Re-group tabs.

  // We need to match current tabs to stored tabs.
  // Priority: ID match -> URL match.

  const currentTabs = await chrome.tabs.query({});
  const currentTabMap = new Map<number, chrome.tabs.Tab>();
  const currentUrlMap = new Map<string, chrome.tabs.Tab[]>(); // URL -> list of tabs

  currentTabs.forEach(t => {
    if (t.id) currentTabMap.set(t.id, t);
    if (t.url) {
      const list = currentUrlMap.get(t.url) || [];
      list.push(t);
      currentUrlMap.set(t.url, list);
    }
  });

  // Helper to find a tab (async to allow creation)
  const findOrCreateTab = async (stored: StoredTabState): Promise<chrome.tabs.Tab | undefined> => {
    // Try ID
    if (stored.id && currentTabMap.has(stored.id)) {
      const t = currentTabMap.get(stored.id);
      currentTabMap.delete(stored.id!); // Consume
      // Also remove from url map to avoid double usage
      if (t?.url) {
         const list = currentUrlMap.get(t.url);
         if (list) {
            const idx = list.findIndex(x => x.id === t.id);
            if (idx !== -1) list.splice(idx, 1);
         }
      }
      return t;
    }
    // Try URL
    const list = currentUrlMap.get(stored.url);
    if (list && list.length > 0) {
      const t = list.shift();
      if (t?.id) currentTabMap.delete(t.id); // Consume
      return t;
    }

    // Create if missing
    if (stored.url) {
        try {
            const t = await chrome.tabs.create({ url: stored.url, active: false });
            return t;
        } catch (e) {
            logError("Failed to create tab", { url: stored.url, error: e });
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
    const tabsToMove: { tabId: number, stored: StoredTabState }[] = [];

    for (const storedTab of winState.tabs) {
      const found = await findOrCreateTab(storedTab);
      if (found && found.id) {
        tabsToMove.push({ tabId: found.id, stored: storedTab });
      }
    }

    if (tabsToMove.length === 0) continue;

    let targetWindowId: number;

    if (i < currentWindows.length) {
      targetWindowId = currentWindows[i].id!;
    } else {
      // Create new window
      const win = await chrome.windows.create({});
      targetWindowId = win.id!;
      // Note: New window creation adds a tab. We might want to remove it later or ignore it.
    }

    // Move all to window.
    // Note: If we move to index 0, they will be prepended.
    // We should probably just move them to the window first.
    // If we move them individually to correct index, it's safer.

    const tabIds = tabsToMove.map(t => t.tabId);
    try {
      // Optimization: Batch move all tabs at once
      await chrome.tabs.move(tabIds, { windowId: targetWindowId, index: 0 });
    } catch (e) {
      logError("Failed to batch move tabs, falling back to individual moves", { error: e });
      // Fallback: Move individually if batch fails
      for (let j = 0; j < tabsToMove.length; j++) {
        const { tabId } = tabsToMove[j];
        try {
          await chrome.tabs.move(tabId, { windowId: targetWindowId, index: j });
        } catch (e2) {
          logError("Failed to move tab individually", { tabId, error: e2 });
        }
      }
    }

    // Handle pinning after move
    for (const { tabId, stored } of tabsToMove) {
      try {
        if (stored.pinned) {
          await chrome.tabs.update(tabId, { pinned: true });
        } else {
          // If currently pinned but shouldn't be
          const current = await chrome.tabs.get(tabId);
          if (current.pinned) await chrome.tabs.update(tabId, { pinned: false });
        }
      } catch (e) {
        logError("Failed to update tab pin state", { tabId, error: e });
      }
    }

    // Handle Groups
    // Identify groups in this window
    const groups = new Map<string, number[]>(); // title+color -> tabIds
    const groupColors = new Map<string, chrome.tabGroups.ColorEnum>();

    for (const item of tabsToMove) {
      if (item.stored.groupTitle !== undefined) {
        // Use title as key (or unique ID if we had one, but we don't persist group IDs)
        // Group ID in storage is ephemeral. Title is key.
        const key = item.stored.groupTitle;
        const list = groups.get(key) || [];
        list.push(item.tabId);
        groups.set(key, list);
        if (item.stored.groupColor) {
             groupColors.set(key, item.stored.groupColor as chrome.tabGroups.ColorEnum);
        }
      } else {
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
