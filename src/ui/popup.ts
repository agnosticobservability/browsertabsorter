import { RuntimeResponse, TabGroup, TabMetadata } from "../shared/types.js";

type TabWithGroup = TabMetadata & {
  groupLabel: string;
  groupColor: string;
  reason: string;
};

interface WindowView {
  id: number;
  tabs: TabWithGroup[];
  tabCount: number;
  groupCount: number;
  pinnedCount: number;
}

const refreshButton = document.getElementById("refresh") as HTMLButtonElement;
const regroupButton = document.getElementById("regroup") as HTMLButtonElement;
const saveButton = document.getElementById("saveSession") as HTMLButtonElement;
const sessionNameInput = document.getElementById("sessionName") as HTMLInputElement;
const searchInput = document.getElementById("tabSearch") as HTMLInputElement;
const windowsContainer = document.getElementById("windows") as HTMLDivElement;

let windowState: WindowView[] = [];
let focusedWindowId: number | null = null;
const expandedWindows = new Set<number>();

const fetchState = async () => {
  const response = await chrome.runtime.sendMessage({ type: "getState" });
  return response as RuntimeResponse<{ groups: TabGroup[] }>;
};

const applyGrouping = async () => {
  const response = await chrome.runtime.sendMessage({ type: "applyGrouping" });
  return response as RuntimeResponse<unknown>;
};

const mapWindows = (groups: TabGroup[]): WindowView[] => {
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
      return { id, tabs, tabCount: tabs.length, groupCount, pinnedCount };
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

const badge = (text: string, className = "") => {
  const pill = document.createElement("span");
  pill.className = `badge ${className}`.trim();
  pill.textContent = text;
  return pill;
};

const renderTabs = (tabs: TabWithGroup[]) => {
  const list = document.createElement("div");
  list.className = "tab-list";

  tabs.forEach((tab) => {
    const row = document.createElement("div");
    row.className = "tab-row";

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
    row.append(main, actions);
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

    const title = document.createElement("h2");
    title.className = "window-title";
    title.textContent = `Window ${window.id}`;
    if (focusedWindowId && focusedWindowId === window.id) {
      title.appendChild(badge("Active", "pill-blue"));
    }

    meta.append(
      title,
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
      card.appendChild(renderTabs(visibleTabs));
    }

    windowsContainer.appendChild(card);
  });
};

const onSaveSession = async () => {
  const name = sessionNameInput.value.trim() || `Session ${new Date().toLocaleString()}`;
  const state = await fetchState();
  if (!state.ok || !state.data) return;

  await chrome.runtime.sendMessage({ type: "saveSession", payload: { name, groups: state.data.groups } });
  sessionNameInput.value = "";
};

const loadState = async () => {
  const [state, currentWindow] = await Promise.all([fetchState(), chrome.windows.getCurrent()]);
  if (!state.ok || !state.data) return;
  focusedWindowId = currentWindow?.id ?? null;
  windowState = mapWindows(state.data.groups);
  if (windowState.length && expandedWindows.size === 0) {
    const initial = windowState.find((win) => win.id === focusedWindowId) ?? windowState[0];
    expandedWindows.add(initial.id);
  }
  renderWindows();
};

const initialize = async () => {
  await loadState();
};

refreshButton.addEventListener("click", loadState);
regroupButton.addEventListener("click", async () => {
  await applyGrouping();
  await loadState();
});
saveButton.addEventListener("click", onSaveSession);
searchInput.addEventListener("input", renderWindows);

initialize();
