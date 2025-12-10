import {
  ApplyGroupingPayload,
  GroupingSelection,
  Preferences,
  RuntimeResponse,
  SortingStrategy,
  TabGroup,
  TabMetadata
} from "../shared/types.js";

type TabWithGroup = TabMetadata & {
  groupLabel: string;
  groupColor: string;
  reason: string;
};

interface WindowView {
  id: number;
  title: string;
  tabs: TabWithGroup[];
  tabCount: number;
  groupCount: number;
  pinnedCount: number;
}

const refreshButton = document.getElementById("refresh") as HTMLButtonElement;
const groupButton = document.getElementById("group") as HTMLButtonElement;
const saveButton = document.getElementById("saveSession") as HTMLButtonElement;
const sessionNameInput = document.getElementById("sessionName") as HTMLInputElement;
const regroupButton = document.getElementById("regroup") as HTMLButtonElement;
const searchInput = document.getElementById("tabSearch") as HTMLInputElement;
const windowsContainer = document.getElementById("windows") as HTMLDivElement;
const sortPinned = document.getElementById("sortPinnedFlyout") as HTMLInputElement;
const sortRecency = document.getElementById("sortRecencyFlyout") as HTMLInputElement;
const sortHierarchy = document.getElementById("sortHierarchyFlyout") as HTMLInputElement;

let windowState: WindowView[] = [];
let focusedWindowId: number | null = null;
const expandedWindows = new Set<number>();
const selectedWindows = new Set<number>();
const selectedTabs = new Set<number>();
let preferences: Preferences | null = null;
let sortingInitialized = false;

const fetchState = async () => {
  const response = await chrome.runtime.sendMessage({ type: "getState" });
  return response as RuntimeResponse<{ groups: TabGroup[]; preferences: Preferences }>;
};

const applyGrouping = async (payload: ApplyGroupingPayload) => {
  const response = await chrome.runtime.sendMessage({ type: "applyGrouping", payload });
  return response as RuntimeResponse<unknown>;
};

const mapWindows = (groups: TabGroup[], windowTitles: Map<number, string>): WindowView[] => {
  const windows = new Map<number, TabWithGroup[]>();

  groups.forEach((group) => {
    group.tabs.forEach((tab) => {
      const decorated: TabWithGroup = {
        ...tab,
        groupLabel: group.label,
        groupColor: group.color,
        reason: group.reason
      };
      const existing = windows.get(tab.windowId) ?? [];
      existing.push(decorated);
      windows.set(tab.windowId, existing);
    });
  });

  return Array.from(windows.entries())
    .map<WindowView>(([id, tabs]) => {
      const groupCount = new Set(tabs.map((tab) => tab.groupLabel)).size;
      const pinnedCount = tabs.filter((tab) => tab.pinned).length;
      return {
        id,
        title: windowTitles.get(id) ?? `Window ${id}`,
        tabs,
        tabCount: tabs.length,
        groupCount,
        pinnedCount
      };
    })
    .sort((a, b) => a.id - b.id);
};

const formatDomain = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch (error) {
    return url;
  }
};

const pruneSelections = () => {
  const availableWindows = new Set(windowState.map((window) => window.id));
  const availableTabs = new Set<number>();
  windowState.forEach((window) => {
    window.tabs.forEach((tab) => availableTabs.add(tab.id));
  });

  Array.from(selectedWindows).forEach((id) => {
    if (!availableWindows.has(id)) selectedWindows.delete(id);
  });

  Array.from(selectedTabs).forEach((id) => {
    if (!availableTabs.has(id)) selectedTabs.delete(id);
  });
};

const toggleWindowSelection = (window: WindowView, checked: boolean) => {
  if (checked) {
    selectedWindows.add(window.id);
    window.tabs.forEach((tab) => selectedTabs.add(tab.id));
  } else {
    selectedWindows.delete(window.id);
    window.tabs.forEach((tab) => selectedTabs.delete(tab.id));
  }
};

const updateWindowSelectionFromTabs = (window: WindowView) => {
  const allSelected = window.tabs.every((tab) => selectedTabs.has(tab.id));
  if (allSelected) {
    selectedWindows.add(window.id);
  } else {
    selectedWindows.delete(window.id);
  }
};

const buildSelectionPayload = (): GroupingSelection => {
  return {
    windowIds: Array.from(selectedWindows),
    tabIds: Array.from(selectedTabs)
  };
};

const syncGroupButtonState = () => {
  groupButton.disabled = selectedWindows.size === 0 && selectedTabs.size === 0;
};

const applySortingSelection = (sorting: SortingStrategy[]) => {
  sortPinned.checked = sorting.includes("pinned");
  sortRecency.checked = sorting.includes("recency");
  sortHierarchy.checked = sorting.includes("hierarchy");
};

const getSelectedSorting = (): SortingStrategy[] => {
  const selected: SortingStrategy[] = [];
  if (sortPinned.checked) selected.push("pinned");
  if (sortRecency.checked) selected.push("recency");
  if (sortHierarchy.checked) selected.push("hierarchy");
  if (selected.length === 0) {
    return preferences?.sorting ?? ["pinned", "recency"];
  }
  return selected;
};

const badge = (text: string, className = "") => {
  const pill = document.createElement("span");
  pill.className = `badge ${className}`.trim();
  pill.textContent = text;
  return pill;
};

const renderTabs = (tabs: TabWithGroup[], window: WindowView) => {
  const list = document.createElement("div");
  list.className = "tab-list";

  tabs.forEach((tab) => {
    const row = document.createElement("div");
    row.className = "tab-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "select-checkbox";
    checkbox.checked = selectedTabs.has(tab.id);
    checkbox.addEventListener("change", (event) => {
      const checked = (event.target as HTMLInputElement).checked;
      if (checked) {
        selectedTabs.add(tab.id);
      } else {
        selectedTabs.delete(tab.id);
      }
      updateWindowSelectionFromTabs(window);
      syncGroupButtonState();
    });

    const main = document.createElement("div");
    main.className = "tab-main";

    const title = document.createElement("p");
    title.className = "tab-title";
    title.textContent = tab.title;

    const url = document.createElement("p");
    url.className = "tab-url";
    url.textContent = formatDomain(tab.url);

    const meta = document.createElement("div");
    meta.className = "tab-meta";

    const group = document.createElement("span");
    group.className = "group-pill";
    group.textContent = tab.groupLabel;
    group.style.borderColor = tab.groupColor;
    group.style.backgroundColor = tab.groupColor;
    group.style.color = "#0f172a";

    const reason = badge(tab.reason, "pill-amber");
    if (tab.pinned) {
      meta.appendChild(badge("Pinned", "pill-green"));
    }
    meta.append(group, reason);

    main.append(title, url, meta);

    const actions = document.createElement("div");
    actions.className = "tab-actions";

    const goButton = document.createElement("button");
    goButton.textContent = "Go to tab";
    goButton.addEventListener("click", async () => {
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(tab.id, { active: true });
    });

    const pinButton = document.createElement("button");
    pinButton.textContent = tab.pinned ? "Unpin" : "Pin";
    pinButton.addEventListener("click", async () => {
      await chrome.tabs.update(tab.id, { pinned: !tab.pinned });
      await loadState();
    });

    const closeButton = document.createElement("button");
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", async () => {
      await chrome.tabs.remove(tab.id);
      await loadState();
    });

    actions.append(goButton, pinButton, closeButton);
    row.append(checkbox, main, actions);
    list.appendChild(row);
  });

  return list;
};

const renderWindows = () => {
  const query = searchInput.value.trim().toLowerCase();
  windowsContainer.innerHTML = "";

  const filtered = windowState
    .map((window) => {
      if (!query) return { window, visibleTabs: window.tabs };
      const visibleTabs = window.tabs.filter(
        (tab) => tab.title.toLowerCase().includes(query) || tab.url.toLowerCase().includes(query)
      );
      return { window, visibleTabs };
    })
    .filter(({ visibleTabs }) => visibleTabs.length > 0 || !query);

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = query ? "No tabs match your search." : "No windows found.";
    windowsContainer.appendChild(empty);
    return;
  }

  filtered.forEach(({ window, visibleTabs }) => {
    const expanded = query ? true : expandedWindows.has(window.id);

    const card = document.createElement("article");
    card.className = "window-card";

    const header = document.createElement("div");
    header.className = "window-header";

    const meta = document.createElement("div");
    meta.className = "window-meta";

    const windowCheckbox = document.createElement("input");
    windowCheckbox.type = "checkbox";
    windowCheckbox.className = "select-checkbox";
    windowCheckbox.checked = selectedWindows.has(window.id);
    windowCheckbox.addEventListener("change", (event) => {
      const checked = (event.target as HTMLInputElement).checked;
      toggleWindowSelection(window, checked);
      syncGroupButtonState();
      renderWindows();
    });

    const title = document.createElement("h2");
    title.className = "window-title";
    title.textContent = window.title;
    if (focusedWindowId && focusedWindowId === window.id) {
      title.appendChild(badge("Active", "pill-blue"));
    }

    const windowTitle = document.createElement("div");
    windowTitle.className = "window-info";
    windowTitle.append(windowCheckbox, title);

    meta.append(
      windowTitle,
      badge(`${window.tabCount} tabs`),
      badge(`${window.groupCount} groups`),
      badge(`${window.pinnedCount} pinned`, "pill-green")
    );

    const actions = document.createElement("div");
    actions.className = "window-actions";

    const toggle = document.createElement("button");
    toggle.textContent = expanded ? "Hide tabs" : "Show tabs";
    const toggleWindow = () => {
      if (expandedWindows.has(window.id)) {
        expandedWindows.delete(window.id);
      } else {
        expandedWindows.add(window.id);
      }
      renderWindows();
    };

    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleWindow();
    });

    const focus = document.createElement("button");
    focus.textContent = "Focus";
    focus.addEventListener("click", async () => {
      await chrome.windows.update(window.id, { focused: true });
    });

    const close = document.createElement("button");
    close.textContent = "Close window";
    close.addEventListener("click", async () => {
      await chrome.windows.remove(window.id);
      await loadState();
    });

    actions.append(toggle, focus, close);
    header.append(meta, actions);
    header.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".window-actions")) return;
      toggleWindow();
    });
    card.appendChild(header);

    if (expanded) {
      card.appendChild(renderTabs(visibleTabs, window));
    }

    windowsContainer.appendChild(card);
  });
};

const loadState = async () => {
  const [state, currentWindow, chromeWindows] = await Promise.all([
    fetchState(),
    chrome.windows.getCurrent(),
    chrome.windows.getAll({ windowTypes: ["normal"], populate: true })
  ]);
  if (!state.ok || !state.data) return;

  preferences = state.data.preferences;
  if (!sortingInitialized) {
    applySortingSelection(preferences.sorting);
    sortingInitialized = true;
  }

  focusedWindowId = currentWindow?.id ?? null;
  const windowTitles = new Map<number, string>();
  chromeWindows.forEach((win) => {
    if (!win.id) return;
    const activeTabTitle = win.tabs?.find((tab) => tab.active)?.title;
    const firstTabTitle = win.tabs?.[0]?.title;
    const title = activeTabTitle ?? firstTabTitle ?? `Window ${win.id}`;
    windowTitles.set(win.id, title);
  });
  windowState = mapWindows(state.data.groups, windowTitles);
  if (windowState.length && expandedWindows.size === 0) {
    const initial = windowState.find((win) => win.id === focusedWindowId) ?? windowState[0];
    expandedWindows.add(initial.id);
  }
  pruneSelections();
  syncGroupButtonState();
  renderWindows();
};

const initialize = async () => {
  await loadState();
};

refreshButton.addEventListener("click", loadState);
groupButton.addEventListener("click", async () => {
  const selection = buildSelectionPayload();
  const sorting = getSelectedSorting();
  await applyGrouping({ selection, sorting });
  await loadState();
});
searchInput.addEventListener("input", renderWindows);

initialize();
