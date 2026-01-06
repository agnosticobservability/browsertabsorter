import {
  GroupingSelection,
  Preferences,
  SavedState,
  SortingStrategy,
} from "../shared/types.js";
import {
  applyGrouping,
  applySorting,
  fetchState,
  ICONS,
  mapWindows,
  sendMessage,
  TabWithGroup,
  WindowView
} from "./common.js";

// Elements
const searchInput = document.getElementById("tabSearch") as HTMLInputElement;
const windowsContainer = document.getElementById("windows") as HTMLDivElement;
const sortPinned = document.getElementById("sortPinned") as HTMLInputElement;
const sortRecency = document.getElementById("sortRecency") as HTMLInputElement;
const sortHierarchy = document.getElementById("sortHierarchy") as HTMLInputElement;
const sortTitle = document.getElementById("sortTitle") as HTMLInputElement;
const sortUrl = document.getElementById("sortUrl") as HTMLInputElement;
const sortContext = document.getElementById("sortContext") as HTMLInputElement;
const sortSection = document.querySelector(".sort-chips") as HTMLDivElement;

const selectAllCheckbox = document.getElementById("selectAll") as HTMLInputElement;
const btnSort = document.getElementById("btnSort") as HTMLButtonElement;
const btnGroup = document.getElementById("btnGroup") as HTMLButtonElement;
const btnUngroup = document.getElementById("btnUngroup") as HTMLButtonElement;
const btnMerge = document.getElementById("btnMerge") as HTMLButtonElement;

// Stats
const statTabs = document.getElementById("statTabs") as HTMLElement;
const statGroups = document.getElementById("statGroups") as HTMLElement;
const statWindows = document.getElementById("statWindows") as HTMLElement;

let windowState: WindowView[] = [];
let focusedWindowId: number | null = null;
const selectedTabs = new Set<number>();
let preferences: Preferences | null = null;
let sortingInitialized = false;

// Tree State
const expandedNodes = new Set<string>();
const TREE_ICONS = {
  chevronRight: `<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
  folder: `<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
};

const updateStats = () => {
  const totalTabs = windowState.reduce((acc, win) => acc + win.tabCount, 0);
  const totalGroups = new Set(windowState.flatMap(w => w.tabs.filter(t => t.groupLabel).map(t => `${w.id}-${t.groupLabel}`))).size;

  statTabs.textContent = `${totalTabs} Tabs`;
  statGroups.textContent = `${totalGroups} Groups`;
  statWindows.textContent = `${windowState.length} Windows`;

  // Update selection buttons
  const hasSelection = selectedTabs.size > 0;
  btnSort.disabled = !hasSelection;
  btnGroup.disabled = !hasSelection;
  btnUngroup.disabled = !hasSelection;
  btnMerge.disabled = !hasSelection;
  btnSort.style.opacity = hasSelection ? "1" : "0.5";
  btnGroup.style.opacity = hasSelection ? "1" : "0.5";
  btnUngroup.style.opacity = hasSelection ? "1" : "0.5";
  btnMerge.style.opacity = hasSelection ? "1" : "0.5";

  // Update Select All Checkbox State
  if (totalTabs === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  } else if (selectedTabs.size === totalTabs) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
  } else if (selectedTabs.size > 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  }
};

const createNode = (
    content: HTMLElement,
    childrenContainer: HTMLElement | null,
    level: 'window' | 'group' | 'tab',
    isExpanded: boolean = true,
    onToggle?: () => void
) => {
    const node = document.createElement("div");
    node.className = "tree-node";

    const row = document.createElement("div");
    row.className = `tree-row ${level}-row`;

    // Toggle
    const toggle = document.createElement("div");
    toggle.className = `tree-toggle ${isExpanded ? 'rotated' : ''}`;
    if (childrenContainer) {
        toggle.innerHTML = TREE_ICONS.chevronRight;
        toggle.onclick = (e) => {
            e.stopPropagation();
            if (onToggle) onToggle();
        };
    } else {
        toggle.classList.add('hidden');
    }

    row.appendChild(toggle);
    row.appendChild(content); // Content handles checkbox + icon + text + actions

    node.appendChild(row);

    if (childrenContainer) {
        childrenContainer.className = `tree-children ${isExpanded ? 'expanded' : ''}`;
        node.appendChild(childrenContainer);
    }

    // Toggle interaction on row click for Windows and Groups
    if (childrenContainer && level !== 'tab') {
        row.addEventListener('click', (e) => {
            // Avoid toggling if clicking actions or checkbox
            if ((e.target as HTMLElement).closest('.action-btn') || (e.target as HTMLElement).closest('.tree-checkbox')) return;
            if (onToggle) onToggle();
        });
    }

    return { node, toggle, childrenContainer };
};

const renderTree = () => {
  const query = searchInput.value.trim().toLowerCase();
  windowsContainer.innerHTML = "";

  // Filter Logic
  const filtered = windowState
    .map((window) => {
      if (!query) return { window, visibleTabs: window.tabs };
      const visibleTabs = window.tabs.filter(
        (tab) => tab.title.toLowerCase().includes(query) || tab.url.toLowerCase().includes(query)
      );
      return { window, visibleTabs };
    })
    .filter(({ visibleTabs }) => visibleTabs.length > 0 || !query);

  filtered.forEach(({ window, visibleTabs }) => {
    const windowKey = `w-${window.id}`;
    if (!expandedNodes.has(windowKey) && !query) expandedNodes.add(windowKey);
    const isExpanded = !!query || expandedNodes.has(windowKey);

    // Window Checkbox Logic
    const allTabIds = visibleTabs.map(t => t.id);
    const selectedCount = allTabIds.filter(id => selectedTabs.has(id)).length;
    const isAll = selectedCount === allTabIds.length && allTabIds.length > 0;
    const isSome = selectedCount > 0 && selectedCount < allTabIds.length;

    const winCheckbox = document.createElement("input");
    winCheckbox.type = "checkbox";
    winCheckbox.className = "tree-checkbox";
    winCheckbox.checked = isAll;
    winCheckbox.indeterminate = isSome;
    winCheckbox.onclick = (e) => {
        e.stopPropagation();
        const targetState = !isAll; // If all were selected, deselect. Otherwise select all.
        allTabIds.forEach(id => {
            if (targetState) selectedTabs.add(id);
            else selectedTabs.delete(id);
        });
        renderTree();
    };

    // Window Content
    const winContent = document.createElement("div");
    winContent.style.display = "flex";
    winContent.style.alignItems = "center";
    winContent.style.flex = "1";
    winContent.style.overflow = "hidden";

    const label = document.createElement("div");
    label.className = "tree-label";
    label.textContent = window.title;

    const count = document.createElement("div");
    count.className = "tree-count";
    count.textContent = `(${visibleTabs.length} Tabs)`;

    winContent.append(winCheckbox, label, count);

    // Children (Groups)
    const childrenContainer = document.createElement("div");

    // Group tabs
    const groups = new Map<string, { color: string; tabs: TabWithGroup[] }>();
    const ungroupedTabs: TabWithGroup[] = [];
    visibleTabs.forEach(tab => {
        if (tab.groupLabel) {
            const key = tab.groupLabel;
            const entry = groups.get(key) ?? { color: tab.groupColor!, tabs: [] };
            entry.tabs.push(tab);
            groups.set(key, entry);
        } else {
            ungroupedTabs.push(tab);
        }
    });

    const createTabNode = (tab: TabWithGroup) => {
        const tabContent = document.createElement("div");
        tabContent.style.display = "flex";
        tabContent.style.alignItems = "center";
        tabContent.style.flex = "1";
        tabContent.style.overflow = "hidden";

        // Tab Checkbox
        const tabCheckbox = document.createElement("input");
        tabCheckbox.type = "checkbox";
        tabCheckbox.className = "tree-checkbox";
        tabCheckbox.checked = selectedTabs.has(tab.id);
        tabCheckbox.onclick = (e) => {
            e.stopPropagation();
            if (tabCheckbox.checked) selectedTabs.add(tab.id);
            else selectedTabs.delete(tab.id);
            renderTree();
        };

        const tabIcon = document.createElement("div");
        tabIcon.className = "tree-icon";
        if (tab.favIconUrl) {
            const img = document.createElement("img");
            img.src = tab.favIconUrl;
            img.onerror = () => { tabIcon.innerHTML = ICONS.defaultFile; };
            tabIcon.appendChild(img);
        } else {
            tabIcon.innerHTML = ICONS.defaultFile;
        }

        const tabTitle = document.createElement("div");
        tabTitle.className = "tree-label";
        tabTitle.textContent = tab.title;
        tabTitle.title = tab.title;

        const tabActions = document.createElement("div");
        tabActions.className = "row-actions";
        const closeBtn = document.createElement("button");
        closeBtn.className = "action-btn delete";
        closeBtn.innerHTML = ICONS.close;
        closeBtn.title = "Close Tab";
        closeBtn.onclick = async (e) => {
            e.stopPropagation();
            await chrome.tabs.remove(tab.id);
            await loadState();
        };
        tabActions.appendChild(closeBtn);

        tabContent.append(tabCheckbox, tabIcon, tabTitle, tabActions);

        const { node: tabNode } = createNode(tabContent, null, 'tab');
        tabNode.onclick = async (e) => {
            // Clicking tab row activates tab (unless clicking checkbox/action)
            if ((e.target as HTMLElement).closest('.tree-checkbox')) return;
            await chrome.tabs.update(tab.id, { active: true });
            await chrome.windows.update(tab.windowId, { focused: true });
        };
        return tabNode;
    };

    Array.from(groups.entries()).sort().forEach(([groupLabel, groupData]) => {
        const groupKey = `${windowKey}-g-${groupLabel}`;
        if (!expandedNodes.has(groupKey) && !query) expandedNodes.add(groupKey);
        const isGroupExpanded = !!query || expandedNodes.has(groupKey);

        // Group Checkbox Logic
        const groupTabIds = groupData.tabs.map(t => t.id);
        const grpSelectedCount = groupTabIds.filter(id => selectedTabs.has(id)).length;
        const grpIsAll = grpSelectedCount === groupTabIds.length && groupTabIds.length > 0;
        const grpIsSome = grpSelectedCount > 0 && grpSelectedCount < groupTabIds.length;

        const grpCheckbox = document.createElement("input");
        grpCheckbox.type = "checkbox";
        grpCheckbox.className = "tree-checkbox";
        grpCheckbox.checked = grpIsAll;
        grpCheckbox.indeterminate = grpIsSome;
        grpCheckbox.onclick = (e) => {
            e.stopPropagation();
            const targetState = !grpIsAll;
            groupTabIds.forEach(id => {
                if (targetState) selectedTabs.add(id);
                else selectedTabs.delete(id);
            });
            renderTree();
        };

        // Group Content
        const grpContent = document.createElement("div");
        grpContent.style.display = "flex";
        grpContent.style.alignItems = "center";
        grpContent.style.flex = "1";
        grpContent.style.overflow = "hidden";
        if (groupData.color) grpContent.style.color = groupData.color;

        const icon = document.createElement("div");
        icon.className = "tree-icon";
        icon.innerHTML = TREE_ICONS.folder;

        const grpLabel = document.createElement("div");
        grpLabel.className = "tree-label";
        grpLabel.textContent = groupLabel;

        const grpCount = document.createElement("div");
        grpCount.className = "tree-count";
        grpCount.textContent = `(${groupData.tabs.length})`;

        // Group Actions
        const actions = document.createElement("div");
        actions.className = "row-actions";
        const ungroupBtn = document.createElement("button");
        ungroupBtn.className = "action-btn";
        ungroupBtn.innerHTML = ICONS.ungroup;
        ungroupBtn.title = "Ungroup";
        ungroupBtn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm(`Ungroup ${groupData.tabs.length} tabs?`)) {
                await chrome.tabs.ungroup(groupData.tabs.map(t => t.id));
                await loadState();
            }
        };
        actions.appendChild(ungroupBtn);

        grpContent.append(grpCheckbox, icon, grpLabel, grpCount, actions);

        // Tabs
        const tabsContainer = document.createElement("div");
        groupData.tabs.forEach(tab => {
            tabsContainer.appendChild(createTabNode(tab));
        });

        const { node: groupNode, toggle: grpToggle, childrenContainer: grpChildren } = createNode(
            grpContent,
            tabsContainer,
            'group',
            isGroupExpanded,
            () => {
                if (expandedNodes.has(groupKey)) expandedNodes.delete(groupKey);
                else expandedNodes.add(groupKey);

                const expanded = expandedNodes.has(groupKey);
                grpToggle.classList.toggle('rotated', expanded);
                grpChildren!.classList.toggle('expanded', expanded);
            }
        );
        childrenContainer.appendChild(groupNode);
    });

    ungroupedTabs.forEach(tab => {
        childrenContainer.appendChild(createTabNode(tab));
    });

    const { node: winNode, toggle: winToggle, childrenContainer: winChildren } = createNode(
        winContent,
        childrenContainer,
        'window',
        isExpanded,
        () => {
             if (expandedNodes.has(windowKey)) expandedNodes.delete(windowKey);
             else expandedNodes.add(windowKey);

             const expanded = expandedNodes.has(windowKey);
             winToggle.classList.toggle('rotated', expanded);
             winChildren!.classList.toggle('expanded', expanded);
        }
    );

    windowsContainer.appendChild(winNode);
  });

  updateStats();
};

const renderSortOptions = () => {
    if (!preferences) return;

    // Remove existing custom chips first
    document.querySelectorAll(".chip[data-custom='true']").forEach(el => el.remove());

    preferences.customGroupingStrategies.forEach(strategy => {
        const label = document.createElement("label");
        label.className = "chip";
        label.dataset.custom = "true";
        if (preferences?.sorting.includes(strategy.id)) {
            label.classList.add("active");
        }

        const input = document.createElement("input");
        input.type = "checkbox";
        input.id = `sort-${strategy.id}`;
        input.checked = preferences?.sorting.includes(strategy.id) ?? false;

        input.addEventListener("change", (e) => {
             const target = e.target as HTMLInputElement;
             if (target.checked) target.parentElement?.classList.add('active');
             else target.parentElement?.classList.remove('active');
        });

        label.appendChild(input);
        label.appendChild(document.createTextNode(` ${strategy.name}`));
        sortSection.appendChild(label);
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
  if (!sortingInitialized && preferences) {
    const s = preferences.sorting;
    sortPinned.checked = s.includes("pinned");
    sortRecency.checked = s.includes("recency");
    sortHierarchy.checked = s.includes("hierarchy");
    sortTitle.checked = s.includes("title");
    sortUrl.checked = s.includes("url");
    sortContext.checked = s.includes("context");

    // Render custom options
    renderSortOptions();
    sortingInitialized = true;
  }

  // Re-render sort options if preferences updated (e.g. new strategy added)
  if (preferences && sortingInitialized) {
      renderSortOptions();
  }

  if (preferences && preferences.theme) {
      // Load theme from prefs, no save needed
      applyTheme(preferences.theme, false);
  }

  focusedWindowId = currentWindow?.id ?? null;
  const windowTitles = new Map<number, string>();
  chromeWindows.forEach((win) => {
    if (!win.id) return;
    const activeTabTitle = win.tabs?.find((tab) => tab.active)?.title;
    const title = activeTabTitle ?? `Window ${win.id}`;
    windowTitles.set(win.id, title);
  });

  windowState = mapWindows(state.data.groups, windowTitles);

  // Initialize expanded state for new windows
  windowState.forEach(w => {
      if (!expandedNodes.has(`w-${w.id}`)) expandedNodes.add(`w-${w.id}`);
  });

  renderTree();
};

const getSelectedSorting = (): SortingStrategy[] => {
  const selected: SortingStrategy[] = [];
  if (sortPinned.checked) selected.push("pinned");
  if (sortRecency.checked) selected.push("recency");
  if (sortHierarchy.checked) selected.push("hierarchy");
  if (sortTitle.checked) selected.push("title");
  if (sortUrl.checked) selected.push("url");
  if (sortContext.checked) selected.push("context");

  // Add custom strategies
  if (preferences) {
      preferences.customGroupingStrategies.forEach(s => {
          const input = document.getElementById(`sort-${s.id}`) as HTMLInputElement;
          if (input && input.checked) selected.push(s.id);
      });
  }

  return selected.length ? selected : (preferences?.sorting ?? ["pinned", "recency"]);
};

const triggerSort = async (selection?: GroupingSelection) => {
    const sorting = getSelectedSorting();
    await applySorting({ selection, sorting });
    await loadState();
};

const triggerGroup = async (selection?: GroupingSelection) => {
    const sorting = getSelectedSorting();
    await applyGrouping({ selection, sorting });
    await loadState();
};

// Listeners
selectAllCheckbox.addEventListener("change", (e) => {
    const targetState = (e.target as HTMLInputElement).checked;
    if (targetState) {
        // Select All
        windowState.forEach(win => {
            win.tabs.forEach(tab => selectedTabs.add(tab.id));
        });
    } else {
        // Deselect All
        selectedTabs.clear();
    }
    renderTree();
});

btnSort.addEventListener("click", () => triggerSort({ tabIds: Array.from(selectedTabs) }));
btnGroup.addEventListener("click", () => triggerGroup({ tabIds: Array.from(selectedTabs) }));
btnUngroup.addEventListener("click", async () => {
  if (confirm(`Ungroup ${selectedTabs.size} tabs?`)) {
      await chrome.tabs.ungroup(Array.from(selectedTabs));
      await loadState();
  }
});
btnMerge.addEventListener("click", async () => {
  if (confirm(`Merge ${selectedTabs.size} tabs into one group?`)) {
      const res = await sendMessage("mergeSelection", { tabIds: Array.from(selectedTabs) });
      if (!res.ok) alert("Merge failed: " + res.error);
      else await loadState();
  }
});

document.getElementById("btnUndo")?.addEventListener("click", async () => {
  const res = await sendMessage("undo");
  if (!res.ok) alert("Undo failed: " + res.error);
});

document.getElementById("btnSaveState")?.addEventListener("click", async () => {
  const name = prompt("Enter a name for this state:");
  if (name) {
    const res = await sendMessage("saveState", { name });
    if (!res.ok) alert("Save failed: " + res.error);
  }
});

const loadStateDialog = document.getElementById("loadStateDialog") as HTMLDialogElement;
const savedStateList = document.getElementById("savedStateList") as HTMLElement;

document.getElementById("btnOptions")?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("btnLoadState")?.addEventListener("click", async () => {
  const res = await sendMessage<SavedState[]>("getSavedStates");
  if (res.ok && res.data) {
    savedStateList.innerHTML = "";
    res.data.forEach((state) => {
      const li = document.createElement("li");
      li.style.display = "flex";
      li.style.justifyContent = "space-between";
      li.style.padding = "8px";
      li.style.borderBottom = "1px solid var(--border-color)";

      const span = document.createElement("span");
      span.textContent = `${state.name} (${new Date(state.timestamp).toLocaleString()})`;
      span.style.cursor = "pointer";
      span.onclick = async () => {
        if (confirm(`Load state "${state.name}"?`)) {
          const r = await sendMessage("restoreState", { state });
          if (r.ok) {
              loadStateDialog.close();
              window.close();
          } else {
              alert("Restore failed: " + r.error);
          }
        }
      };

      const delBtn = document.createElement("button");
      delBtn.textContent = "Delete";
      delBtn.style.marginLeft = "8px";
      delBtn.style.background = "transparent";
      delBtn.style.color = "var(--text-color)";
      delBtn.style.border = "1px solid var(--border-color)";
      delBtn.style.borderRadius = "4px";
      delBtn.style.padding = "2px 6px";
      delBtn.onclick = async (e) => {
          e.stopPropagation();
          if (confirm(`Delete state "${state.name}"?`)) {
              await sendMessage("deleteSavedState", { name: state.name });
              li.remove();
          }
      };

      li.appendChild(span);
      li.appendChild(delBtn);
      savedStateList.appendChild(li);
    });
    loadStateDialog.showModal();
  } else {
      alert("Failed to load states: " + res.error);
  }
});

document.getElementById("btnCloseLoadState")?.addEventListener("click", () => {
    loadStateDialog.close();
});

// Add toggle active class for chips
document.querySelectorAll('.chip input').forEach(input => {
    input.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) target.parentElement?.classList.add('active');
        else target.parentElement?.classList.remove('active');
    });
});

searchInput.addEventListener("input", renderTree);

// Auto-refresh
chrome.tabs.onUpdated.addListener(() => loadState());
chrome.tabs.onRemoved.addListener(() => loadState());
chrome.windows.onRemoved.addListener(() => loadState());

// --- Theme Logic ---
const btnTheme = document.getElementById("btnTheme");
const iconSun = document.getElementById("iconSun");
const iconMoon = document.getElementById("iconMoon");

const applyTheme = (theme: 'light' | 'dark', save = false) => {
    if (theme === 'light') {
        document.body.classList.add('light-mode');
        if (iconSun) iconSun.style.display = 'block';
        if (iconMoon) iconMoon.style.display = 'none';
    } else {
        document.body.classList.remove('light-mode');
        if (iconSun) iconSun.style.display = 'none';
        if (iconMoon) iconMoon.style.display = 'block';
    }

    // Sync with Preferences
    if (save) {
        // We use savePreferences which calls the background to store it
        sendMessage("savePreferences", { theme });
    }
};

// Initial load fallback (before loadState loads prefs)
const storedTheme = localStorage.getItem('theme') as 'light' | 'dark';
// If we have a local override, use it temporarily, but loadState will authoritative check prefs
if (storedTheme) applyTheme(storedTheme, false);

btnTheme?.addEventListener('click', () => {
    const isLight = document.body.classList.contains('light-mode');
    const newTheme = isLight ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme); // Keep local copy for fast boot
    applyTheme(newTheme, true);
});

// --- Pin & Resize Logic ---
const btnPin = document.getElementById("btnPin");
btnPin?.addEventListener("click", async () => {
  const url = chrome.runtime.getURL("ui/popup.html");
  await chrome.windows.create({
    url,
    type: "popup",
    width: document.body.offsetWidth,
    height: document.body.offsetHeight
  });
  window.close();
});

const resizeHandle = document.getElementById("resizeHandle");
if (resizeHandle) {
  const saveSize = (w: number, h: number) => {
      localStorage.setItem("popupSize", JSON.stringify({ width: w, height: h }));
  };

  resizeHandle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = document.body.offsetWidth;
      const startHeight = document.body.offsetHeight;

      const onMouseMove = (ev: MouseEvent) => {
          const newWidth = Math.max(500, startWidth + (ev.clientX - startX));
          const newHeight = Math.max(500, startHeight + (ev.clientY - startY));
          document.body.style.width = `${newWidth}px`;
          document.body.style.height = `${newHeight}px`;
      };

      const onMouseUp = (ev: MouseEvent) => {
           const newWidth = Math.max(500, startWidth + (ev.clientX - startX));
           const newHeight = Math.max(500, startHeight + (ev.clientY - startY));
           saveSize(newWidth, newHeight);
           document.removeEventListener("mousemove", onMouseMove);
           document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
  });
}

const adjustForWindowType = async () => {
  try {
    const win = await chrome.windows.getCurrent();
    if (win.type === "popup") {
       if (btnPin) btnPin.style.display = "none";
       // Enable resize handle in pinned mode if it was hidden
       if (resizeHandle) resizeHandle.style.display = "block";
       document.body.style.width = "100%";
       document.body.style.height = "100%";
    } else {
        // Disable resize handle in docked mode
        if (resizeHandle) resizeHandle.style.display = "none";
        // Clear any previous size overrides
        document.body.style.width = "";
        document.body.style.height = "";
    }
  } catch (e) {
      console.error("Error checking window type:", e);
  }
};

adjustForWindowType();
loadState();
