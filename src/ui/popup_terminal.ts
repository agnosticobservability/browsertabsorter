import {
  ApplyGroupingPayload,
  Preferences,
  TabGroup,
  SortingStrategy
} from "../shared/types.js";
import {
  applyGrouping,
  applySorting,
  fetchState,
  mapWindows,
  sendMessage,
  WindowView,
  ICONS
} from "./common.js";

const cmdInput = document.getElementById("cmdInput") as HTMLInputElement;
const windowsContainer = document.getElementById("windows") as HTMLDivElement;
const btnSort = document.getElementById("btnSort") as HTMLElement;
const btnGroup = document.getElementById("btnGroup") as HTMLElement;
const btnUndo = document.getElementById("btnUndo") as HTMLElement;

const sortPinned = document.getElementById("sortPinned") as HTMLInputElement;
const sortRecency = document.getElementById("sortRecency") as HTMLInputElement;
const sortContext = document.getElementById("sortContext") as HTMLInputElement;

let windowState: WindowView[] = [];
let preferences: Preferences | null = null;

const render = () => {
  const query = cmdInput.value.trim().toLowerCase();
  // Simple filter if not a command
  const isCommand = query === 'help' || query.startsWith('sort') || query.startsWith('group');
  const filter = isCommand ? '' : query;

  windowsContainer.innerHTML = "";

  windowState.forEach(win => {
    const visibleTabs = win.tabs.filter(t =>
        !filter || t.title.toLowerCase().includes(filter) || t.url.toLowerCase().includes(filter)
    );

    if (visibleTabs.length === 0) return;

    const card = document.createElement("div");
    card.className = "window-card";

    const header = document.createElement("div");
    header.className = "window-header";
    header.textContent = `[PID:${win.id}] ${win.title} -- ${visibleTabs.length} processes`;
    card.appendChild(header);

    const groups = new Map();
    visibleTabs.forEach(t => {
        if (!groups.has(t.groupLabel)) groups.set(t.groupLabel, []);
        groups.get(t.groupLabel).push(t);
    });

    groups.forEach((tabs, label) => {
        const block = document.createElement("div");
        block.className = "group-block";

        const gHeader = document.createElement("div");
        gHeader.className = "group-header";
        gHeader.textContent = `+ ${label}/`;
        block.appendChild(gHeader);

        tabs.forEach((tab: any) => {
            const item = document.createElement("div");
            item.className = "tab-item";
            item.textContent = `  |-- [${tab.id}] ${tab.title}`;
            item.onclick = () => {
                chrome.tabs.update(tab.id, { active: true });
                chrome.windows.update(tab.windowId, { focused: true });
            };
            block.appendChild(item);
        });
        card.appendChild(block);
    });

    windowsContainer.appendChild(card);
  });
};

const load = async () => {
  const [state, chromeWindows] = await Promise.all([
    fetchState(),
    chrome.windows.getAll({ windowTypes: ["normal"], populate: true })
  ]);

  if (state.ok && state.data) {
    preferences = state.data.preferences;
    if (preferences) {
        sortPinned.checked = preferences.sorting.includes("pinned");
        sortRecency.checked = preferences.sorting.includes("recency");
        sortContext.checked = preferences.sorting.includes("context");
    }

    const windowTitles = new Map<number, string>();
    chromeWindows.forEach(w => {
        if (w.id) windowTitles.set(w.id, `TTY${w.id}`);
    });
    windowState = mapWindows(state.data.groups, windowTitles);
    render();
  }
};

const getSorting = (): SortingStrategy[] => {
    const s: SortingStrategy[] = [];
    if (sortPinned.checked) s.push("pinned");
    if (sortRecency.checked) s.push("recency");
    if (sortContext.checked) s.push("context");
    return s.length ? s : ["pinned", "recency"];
};

const execute = async () => {
    await applySorting({ sorting: getSorting() });
    load();
};

btnSort.onclick = async () => {
    await applySorting({ sorting: getSorting() });
    load();
};

btnGroup.onclick = async () => {
    await applyGrouping({ sorting: getSorting() });
    load();
};

btnUndo.onclick = async () => {
    await sendMessage("undo");
    load();
};

cmdInput.oninput = render;

// Handle enter key for commands (mock)
cmdInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        const cmd = cmdInput.value.trim();
        if (cmd === 'help') {
            alert('Available commands: sort, group, undo, <search_term>');
        } else if (cmd === 'sort') {
             await applySorting({ sorting: getSorting() });
             load();
        } else if (cmd === 'group') {
             await applyGrouping({ sorting: getSorting() });
             load();
        } else if (cmd === 'undo') {
             await sendMessage("undo");
             load();
        }
    }
});

load();
