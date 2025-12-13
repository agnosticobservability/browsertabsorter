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

// Elements
const searchInput = document.getElementById("tabSearch") as HTMLInputElement;
const windowsContainer = document.getElementById("windows") as HTMLDivElement;
const sortPinned = document.getElementById("sortPinnedFlyout") as HTMLInputElement;
const sortRecency = document.getElementById("sortRecencyFlyout") as HTMLInputElement;
const sortHierarchy = document.getElementById("sortHierarchyFlyout") as HTMLInputElement;

// Footer Stats
const footerTotalTabs = document.getElementById("footerTotalTabs") as HTMLElement;
const footerTotalGroups = document.getElementById("footerTotalGroups") as HTMLElement;
const footerExtraStat = document.getElementById("footerExtraStat") as HTMLElement;
const footerPinned = document.getElementById("footerPinned") as HTMLElement;

let windowState: WindowView[] = [];
let focusedWindowId: number | null = null;
const expandedWindows = new Set<number>();
const selectedWindows = new Set<number>();
const selectedTabs = new Set<number>();
let preferences: Preferences | null = null;
let sortingInitialized = false;

// Icons (SVG strings)
const ICONS = {
  active: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>`,
  hide: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`,
  show: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
  focus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>`,
  close: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  defaultFile: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`
};

const GROUP_COLORS: Record<string, string> = {
  grey: "#64748b",
  blue: "#3b82f6",
  red: "#ef4444",
  yellow: "#eab308",
  green: "#22c55e",
  pink: "#ec4899",
  purple: "#a855f7",
  cyan: "#06b6d4",
  orange: "#f97316"
};

const getGroupColor = (name: string) => GROUP_COLORS[name] || "#cbd5e1";

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

const triggerReGroup = async () => {
  const selection = buildSelectionPayload();
  const sorting = getSelectedSorting();
  await applyGrouping({ selection, sorting });
  await loadState();
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

// --- Render Logic ---

const updateFooter = () => {
  const totalTabs = windowState.reduce((acc, win) => acc + win.tabCount, 0);
  const totalPinned = windowState.reduce((acc, win) => acc + win.pinnedCount, 0);

  // Calculate total groups across all windows
  const allGroups = new Set<string>();
  windowState.forEach(win => {
     win.tabs.forEach(t => allGroups.add(`${t.windowId}-${t.groupLabel}`));
  });

  // Update footer text
  footerTotalTabs.textContent = `${totalTabs} tabs`;
  footerTotalGroups.textContent = `${allGroups.size} groups`;
  footerExtraStat.textContent = `${windowState.length} windows`;
  footerPinned.textContent = `${totalPinned} pinned`;
};

const renderGroupItems = (tabs: TabWithGroup[]) => {
  const list = document.createElement("div");
  list.className = "group-list";

  // Group tabs by label
  const groups = new Map<
    string,
    { color: string; reason: string; tabs: TabWithGroup[] }
  >();

  tabs.forEach((tab) => {
    const key = tab.groupLabel;
    const group = groups.get(key) ?? {
      color: tab.groupColor,
      reason: tab.reason,
      tabs: []
    };
    group.tabs.push(tab);
    groups.set(key, group);
  });

  Array.from(groups.entries())
    .sort(([labelA], [labelB]) => labelA.localeCompare(labelB))
    .forEach(([label, group]) => {
      // 1. Group Container
      const groupSection = document.createElement("div");
      groupSection.className = "group-section";

      const colorHex = getGroupColor(group.color);
      groupSection.style.borderColor = colorHex;
      // Use color-mix for tint (works in modern Chrome)
      groupSection.style.backgroundColor = `color-mix(in srgb, ${colorHex}, transparent 90%)`;

      // 2. Group Header
      const header = document.createElement("div");
      header.className = "group-header";
      header.textContent = label;
      groupSection.appendChild(header);

      // 3. Render Individual Tabs
      group.tabs.forEach(tab => {
        const item = document.createElement("div");
        item.className = "group-tab-item";

        // Icon
        const iconContainer = document.createElement("div");
        iconContainer.className = "group-icon";
        if (tab.favIconUrl) {
            const img = document.createElement("img");
            img.src = tab.favIconUrl;
            img.onerror = () => { iconContainer.innerHTML = ICONS.defaultFile; };
            iconContainer.appendChild(img);
        } else {
            iconContainer.innerHTML = ICONS.defaultFile;
        }

        // Content
        const content = document.createElement("div");
        content.className = "group-content";

        const title = document.createElement("div");
        title.className = "group-title";
        // "amazon.com • Misc"
        title.textContent = `${formatDomain(tab.url)} • ${group.reason}`;

        const subtitle = document.createElement("div");
        subtitle.className = "group-subtitle";
        // "1 tab, domain + semantic" (Placeholder-ish logic)
        // Let's use real data: "1 tab, [Title of page]"
        subtitle.textContent = `1 tab, ${tab.title}`;

        content.append(title, subtitle);
        item.append(iconContainer, content);

        groupSection.appendChild(item);
      });

      list.appendChild(groupSection);
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
    empty.style.padding = "20px";
    empty.style.textAlign = "center";
    empty.style.color = "#64748b";
    empty.textContent = query ? "No tabs match your search." : "No windows found.";
    windowsContainer.appendChild(empty);
    return;
  }

  filtered.forEach(({ window, visibleTabs }) => {
    const expanded = query ? true : expandedWindows.has(window.id);

    const card = document.createElement("article");
    card.className = "window-card";

    // Header
    const header = document.createElement("div");
    header.className = "window-header";

    // Info (Left)
    const titleContainer = document.createElement("div");
    titleContainer.className = "window-title-container";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "window-checkbox";
    checkbox.checked = selectedWindows.has(window.id);
    checkbox.addEventListener("change", (event) => {
      const checked = (event.target as HTMLInputElement).checked;
      toggleWindowSelection(window, checked);
      renderWindows();
    });

    const textBlock = document.createElement("div");
    textBlock.className = "window-text-block";

    const title = document.createElement("h3");
    title.className = "window-title";
    title.textContent = window.title;
    title.title = window.title; // Tooltip

    const meta = document.createElement("div");
    meta.className = "window-meta";
    meta.textContent = `(${window.tabCount} tabs, ${window.groupCount} groups, ${window.pinnedCount} pinned)`;

    textBlock.append(title, meta);
    titleContainer.append(checkbox, textBlock);

    // Actions (Right)
    const actions = document.createElement("div");
    actions.className = "window-actions";

    // Helper to create action buttons
    const createActionBtn = (icon: string, label: string, onClick: () => void, isActive: boolean = false) => {
        const btn = document.createElement("button");
        btn.className = `action-btn ${isActive ? "active" : ""}`;
        btn.innerHTML = `${icon}<span>${label}</span>`;
        btn.title = label;
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            onClick();
        });
        return btn;
    };

    const isActiveWindow = focusedWindowId === window.id;

    actions.append(
        createActionBtn(ICONS.active, "Active", async () => {
            await chrome.windows.update(window.id, { focused: true });
        }, isActiveWindow),
        createActionBtn(expanded ? ICONS.hide : ICONS.show, expanded ? "Hide" : "Show", () => {
             if (expandedWindows.has(window.id)) {
                expandedWindows.delete(window.id);
            } else {
                expandedWindows.add(window.id);
            }
            renderWindows();
        }),
        createActionBtn(ICONS.focus, "Focus", async () => {
             await chrome.windows.update(window.id, { focused: true });
        }),
        createActionBtn(ICONS.close, "Close", async () => {
             if (confirm("Are you sure you want to close this window?")) {
                await chrome.windows.remove(window.id);
                await loadState();
            }
        })
    );

    header.append(titleContainer, actions);
    card.appendChild(header);

    // Body (Groups)
    if (expanded) {
        card.appendChild(renderGroupItems(visibleTabs));
    }

    windowsContainer.appendChild(card);
  });

  updateFooter();
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
    if (initial) expandedWindows.add(initial.id);
  }
  pruneSelections();
  renderWindows();
};

const initialize = async () => {
  await loadState();
};

// Event Listeners for Sort Toggles
const handleSortChange = async () => {
    await triggerReGroup();
};

sortPinned.addEventListener("change", handleSortChange);
sortRecency.addEventListener("change", handleSortChange);
sortHierarchy.addEventListener("change", handleSortChange);

// Keep search listener
searchInput.addEventListener("input", renderWindows);

// Auto-refresh?
chrome.tabs.onUpdated.addListener(() => loadState());
chrome.tabs.onRemoved.addListener(() => loadState());
chrome.windows.onRemoved.addListener(() => loadState());

initialize();
