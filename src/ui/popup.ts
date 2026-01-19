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
  WindowView,
  GROUP_COLORS
} from "./common.js";
import { getStrategies, STRATEGIES, StrategyDefinition } from "../shared/strategyRegistry.js";
import { TabGroup, TabMetadata } from "../shared/types.js";

// Elements
const searchInput = document.getElementById("tabSearch") as HTMLInputElement;
const windowsContainer = document.getElementById("windows") as HTMLDivElement;

const selectAllCheckbox = document.getElementById("selectAll") as HTMLInputElement;
const btnApply = document.getElementById("btnApply") as HTMLButtonElement;
const btnUngroup = document.getElementById("btnUngroup") as HTMLButtonElement;
const btnMerge = document.getElementById("btnMerge") as HTMLButtonElement;
const btnSplit = document.getElementById("btnSplit") as HTMLButtonElement;
const btnExpandAll = document.getElementById("btnExpandAll") as HTMLButtonElement;
const btnCollapseAll = document.getElementById("btnCollapseAll") as HTMLButtonElement;

const strategiesList = document.getElementById("strategiesList") as HTMLDivElement;
const toggleStrategies = document.getElementById("toggleStrategies") as HTMLDivElement;
const groupingListContainer = document.getElementById("grouping-strategies") as HTMLDivElement;
const sortingListContainer = document.getElementById("sorting-strategies") as HTMLDivElement;

// Stats
const statTabs = document.getElementById("statTabs") as HTMLElement;
const statGroups = document.getElementById("statGroups") as HTMLElement;
const statWindows = document.getElementById("statWindows") as HTMLElement;

let windowState: WindowView[] = [];
let focusedWindowId: number | null = null;
const selectedTabs = new Set<number>();
let preferences: Preferences | null = null;

// Tree State
const expandedNodes = new Set<string>(); // Default empty = all collapsed
const TREE_ICONS = {
  chevronRight: `<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
  folder: `<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
};

const PREFERENCES_KEY = "preferences";
const DEFAULT_PREFERENCES: Preferences = {
  sorting: ["pinned", "recency"],
  debug: false,
  theme: "dark",
  customGenera: {}
};

const normalizeSorting = (sorting: unknown): SortingStrategy[] => {
  if (Array.isArray(sorting)) {
    return sorting.filter((value): value is SortingStrategy => typeof value === "string");
  }
  if (typeof sorting === "string") {
    return [sorting];
  }
  return [...DEFAULT_PREFERENCES.sorting];
};

const normalizePreferences = (prefs?: Partial<Preferences> | null): Preferences => {
  const merged = { ...DEFAULT_PREFERENCES, ...(prefs ?? {}) };
  return {
    ...merged,
    sorting: normalizeSorting(merged.sorting),
    customStrategies: Array.isArray(merged.customStrategies) ? merged.customStrategies : undefined
  };
};

const mapChromeTab = (tab: chrome.tabs.Tab): TabMetadata | null => {
  if (!tab.id || !tab.windowId || !tab.url || !tab.title) return null;
  return {
    id: tab.id,
    windowId: tab.windowId,
    title: tab.title,
    url: tab.url,
    pinned: Boolean(tab.pinned),
    lastAccessed: tab.lastAccessed,
    openerTabId: tab.openerTabId ?? undefined,
    favIconUrl: tab.favIconUrl,
    groupId: tab.groupId,
    index: tab.index,
    active: tab.active,
    status: tab.status
  };
};

const loadPreferencesFallback = async () => {
  const stored = await chrome.storage.local.get(PREFERENCES_KEY);
  return normalizePreferences(stored?.[PREFERENCES_KEY]);
};

const fetchLocalState = async (): Promise<{ groups: TabGroup[]; preferences: Preferences }> => {
  const [tabs, groups, prefs] = await Promise.all([
    chrome.tabs.query({}),
    chrome.tabGroups.query({}),
    loadPreferencesFallback()
  ]);
  const groupMap = new Map(groups.map(group => [group.id, group]));
  const mappedTabs = tabs
    .map(mapChromeTab)
    .filter((tab): tab is TabMetadata => Boolean(tab))
    .sort((a, b) => a.index - b.index);

  const resultGroups: TabGroup[] = [];
  const tabsByGroupId = new Map<number, TabMetadata[]>();
  const tabsByWindowUngrouped = new Map<number, TabMetadata[]>();

  mappedTabs.forEach(tab => {
    const groupId = tab.groupId ?? -1;
    if (groupId !== -1) {
      const existing = tabsByGroupId.get(groupId) ?? [];
      existing.push(tab);
      tabsByGroupId.set(groupId, existing);
    } else {
      const existing = tabsByWindowUngrouped.get(tab.windowId) ?? [];
      existing.push(tab);
      tabsByWindowUngrouped.set(tab.windowId, existing);
    }
  });

  for (const [groupId, groupTabs] of tabsByGroupId) {
    const browserGroup = groupMap.get(groupId);
    if (browserGroup) {
      resultGroups.push({
        id: `group-${groupId}`,
        windowId: browserGroup.windowId,
        label: browserGroup.title || "Untitled Group",
        color: browserGroup.color,
        tabs: groupTabs,
        reason: "Manual"
      });
    }
  }

  for (const [windowId, tabsForWindow] of tabsByWindowUngrouped) {
    resultGroups.push({
      id: `ungrouped-${windowId}`,
      windowId,
      label: "Ungrouped",
      color: "grey",
      tabs: tabsForWindow,
      reason: "Ungrouped"
    });
  }

  return { groups: resultGroups, preferences: prefs };
};

const hexToRgba = (hex: string, alpha: number) => {
    // Ensure hex format
    if (!hex.startsWith('#')) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const updateStats = () => {
  const totalTabs = windowState.reduce((acc, win) => acc + win.tabCount, 0);
  const totalGroups = new Set(windowState.flatMap(w => w.tabs.filter(t => t.groupLabel).map(t => `${w.id}-${t.groupLabel}`))).size;

  statTabs.textContent = `${totalTabs} Tabs`;
  statGroups.textContent = `${totalGroups} Groups`;
  statWindows.textContent = `${windowState.length} Windows`;

  // Update selection buttons
  const hasSelection = selectedTabs.size > 0;
  btnUngroup.disabled = !hasSelection;
  btnMerge.disabled = !hasSelection;
  btnSplit.disabled = !hasSelection;

  btnUngroup.style.opacity = hasSelection ? "1" : "0.5";
  btnMerge.style.opacity = hasSelection ? "1" : "0.5";
  btnSplit.style.opacity = hasSelection ? "1" : "0.5";

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
    isExpanded: boolean = false,
    onToggle?: () => void
) => {
    const node = document.createElement("div");
    node.className = `tree-node node-${level}`;

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

        // Apply background color to group node
        if (groupData.color) {
            const colorName = groupData.color;
            const hex = GROUP_COLORS[colorName] || colorName; // Fallback if it's already hex
            if (hex.startsWith('#')) {
                groupNode.style.backgroundColor = hexToRgba(hex, 0.1);
                groupNode.style.border = `1px solid ${hexToRgba(hex, 0.2)}`;
            }
        }

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

// Strategy Rendering
function renderStrategyList(container: HTMLElement, strategies: StrategyDefinition[], defaultEnabled: string[]) {
    container.innerHTML = '';

    // Sort enabled by their index in defaultEnabled to maintain priority
    const enabled = strategies.filter(s => defaultEnabled.includes(s.id));
    enabled.sort((a, b) => defaultEnabled.indexOf(a.id) - defaultEnabled.indexOf(b.id));

    const disabled = strategies.filter(s => !defaultEnabled.includes(s.id));

    // Initial render order: Enabled (ordered) then Disabled
    const ordered = [...enabled, ...disabled];

    ordered.forEach(strategy => {
        const isChecked = defaultEnabled.includes(strategy.id);
        const row = document.createElement('div');
        row.className = `strategy-row ${isChecked ? 'active' : ''}`;
        row.dataset.id = strategy.id;
        row.draggable = true;

        row.innerHTML = `
            <div class="strategy-drag-handle">☰</div>
            <input type="checkbox" ${isChecked ? 'checked' : ''}>
            <span class="strategy-label">${strategy.label}</span>
        `;

        if (strategy.isCustom) {
            const autoRunBtn = document.createElement("button");
            autoRunBtn.className = `action-btn auto-run ${strategy.autoRun ? 'active' : ''}`;
            autoRunBtn.innerHTML = ICONS.autoRun;
            autoRunBtn.title = `Auto Run: ${strategy.autoRun ? 'ON' : 'OFF'}`;
            autoRunBtn.style.marginLeft = "auto";
            autoRunBtn.style.opacity = strategy.autoRun ? "1" : "0.3";

            autoRunBtn.onclick = async (e) => {
                e.stopPropagation();
                if (!preferences?.customStrategies) return;

                const customStratIndex = preferences.customStrategies.findIndex(s => s.id === strategy.id);
                if (customStratIndex !== -1) {
                    const strat = preferences.customStrategies[customStratIndex];
                    strat.autoRun = !strat.autoRun;

                    // Update UI immediately
                    const isActive = !!strat.autoRun;
                    autoRunBtn.classList.toggle('active', isActive);
                    autoRunBtn.style.opacity = isActive ? "1" : "0.3";
                    autoRunBtn.title = `Auto Run: ${isActive ? 'ON' : 'OFF'}`;

                    // Save
                    await sendMessage("savePreferences", { customStrategies: preferences.customStrategies });
                    // No need to reload state entirely for this, but if we wanted to reflect changes that depend on it...
                    // loadState();
                }
            };
            row.appendChild(autoRunBtn);
        }

        // Add listeners
        const checkbox = row.querySelector('input[type="checkbox"]');
        checkbox?.addEventListener('change', async (e) => {
            const checked = (e.target as HTMLInputElement).checked;
            row.classList.toggle('active', checked);

            // Immediate save on interaction
            if (preferences) {
                // Update local preference state
                const currentSorting = getSelectedSorting();
                preferences.sorting = currentSorting;
                // We should also persist this to storage, so if user reloads they see it
                await sendMessage("savePreferences", { sorting: currentSorting });
            }
        });

        // Basic Click to toggle (for better UX)
        row.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.action-btn')) return;
            if (e.target !== checkbox) {
                (checkbox as HTMLElement).click();
            }
        });

        addDnDListeners(row);

        container.appendChild(row);
    });
}

function addDnDListeners(row: HTMLElement) {
  row.addEventListener('dragstart', (e) => {
    row.classList.add('dragging');
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
    }
  });

  row.addEventListener('dragend', async () => {
    row.classList.remove('dragging');
    // Save order on drag end
    if (preferences) {
        const currentSorting = getSelectedSorting();
        preferences.sorting = currentSorting;
        await sendMessage("savePreferences", { sorting: currentSorting });
    }
  });
}

function setupContainerDnD(container: HTMLElement) {
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY);

        // Scope draggable to be a strategy-row
        const draggableRow = document.querySelector('.strategy-row.dragging');
        // Ensure we only drag within the same container (prevent cross-list dragging)
        if (draggableRow && draggableRow.parentElement === container) {
             if (afterElement == null) {
                container.appendChild(draggableRow);
             } else {
                container.insertBefore(draggableRow, afterElement);
             }
        }
    });
}

// Initialize DnD on containers once
setupContainerDnD(groupingListContainer);
setupContainerDnD(sortingListContainer);

function getDragAfterElement(container: HTMLElement, y: number) {
  const draggableElements = Array.from(container.querySelectorAll('.strategy-row:not(.dragging)'));

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY, element: null as Element | null }).element;
}

const loadState = async () => {
  try {
    const [stateResult, currentWindowResult, chromeWindowsResult] = await Promise.allSettled([
      fetchState(),
      chrome.windows.getCurrent(),
      chrome.windows.getAll({ windowTypes: ["normal"], populate: true })
    ]);

    let statePayload = stateResult.status === "fulfilled" ? stateResult.value : null;
    if (!statePayload?.ok || !statePayload.data) {
      const error = stateResult.status === "rejected" ? stateResult.reason : statePayload?.error;
      console.warn("Failed to load state from background, using local fallback.", error ?? "Unknown error");
      try {
        statePayload = { ok: true, data: await fetchLocalState() };
      } catch (fallbackError) {
        console.error("Failed to load local fallback state:", fallbackError);
        return;
      }
    }

    preferences = statePayload.data.preferences;

    if (preferences) {
      const s = preferences.sorting || [];

      const allStrategies = getStrategies(preferences.customStrategies);

      // Render Strategy Lists
      const groupingStrategies = allStrategies.filter(st => st.isGrouping);
      renderStrategyList(groupingListContainer, groupingStrategies, s);

      const sortingStrategies = allStrategies.filter(st => st.isSorting);
      renderStrategyList(sortingListContainer, sortingStrategies, s);

      // Initial theme load
      if (preferences.theme) {
        applyTheme(preferences.theme, false);
      }
    }

    if (currentWindowResult.status === "fulfilled") {
      focusedWindowId = currentWindowResult.value?.id ?? null;
    } else {
      focusedWindowId = null;
      console.warn("Failed to get current window:", currentWindowResult.reason);
    }

    const windowTitles = new Map<number, string>();
    const chromeWindows = chromeWindowsResult.status === "fulfilled" && Array.isArray(chromeWindowsResult.value)
      ? chromeWindowsResult.value
      : [];
    if (chromeWindowsResult.status === "rejected") {
      console.warn("Failed to get window list:", chromeWindowsResult.reason);
    }

    chromeWindows.forEach((win) => {
      if (!win.id) return;
      const activeTabTitle = win.tabs?.find((tab) => tab.active)?.title;
      const title = activeTabTitle ?? `Window ${win.id}`;
      windowTitles.set(win.id, title);
    });

    windowState = mapWindows(statePayload.data.groups, windowTitles);

    renderTree();
  } catch (e) {
    console.error("Error loading state:", e);
  }
};

const getStrategyIds = (container: HTMLElement): SortingStrategy[] => {
    return Array.from(container.children)
        .filter(row => (row.querySelector('input[type="checkbox"]') as HTMLInputElement).checked)
        .map(row => (row as HTMLElement).dataset.id as SortingStrategy);
};

const getSelectedSorting = (): SortingStrategy[] => {
  const groupingStrats = getStrategyIds(groupingListContainer);
  const sortingStrats = getStrategyIds(sortingListContainer);

  // Combine: Grouping first, then Sorting (duplicates allowed/handled by backend logic, but let's just concat)
  // Replicating DevTools logic:
  return [...groupingStrats, ...sortingStrats];
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

btnApply?.addEventListener("click", () => triggerGroup({ tabIds: Array.from(selectedTabs) }));

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
btnSplit.addEventListener("click", async () => {
  if (confirm(`Split ${selectedTabs.size} tabs into a new window?`)) {
      const res = await sendMessage("splitSelection", { tabIds: Array.from(selectedTabs) });
      if (!res.ok) alert("Split failed: " + res.error);
      else await loadState();
  }
});

btnExpandAll?.addEventListener("click", () => {
    windowState.forEach(win => {
        expandedNodes.add(`w-${win.id}`);
        win.tabs.forEach(tab => {
            if (tab.groupLabel) {
                 expandedNodes.add(`w-${win.id}-g-${tab.groupLabel}`);
            }
        });
    });
    renderTree();
});

btnCollapseAll?.addEventListener("click", () => {
    expandedNodes.clear();
    renderTree();
});

toggleStrategies.addEventListener("click", () => {
    const isCollapsed = strategiesList.classList.toggle("collapsed");
    toggleStrategies.classList.toggle("collapsed", isCollapsed);
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
loadState().catch(e => console.error("Load state failed", e));
