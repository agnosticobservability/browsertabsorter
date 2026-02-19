import {
  GroupingSelection,
  Preferences,
  SavedState,
  SortingStrategy,
  LogLevel,
  TabGroup
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
  GROUP_COLORS,
  getDragAfterElement
} from "./common.js";
import { getStrategies, STRATEGIES, StrategyDefinition } from "../shared/strategyRegistry.js";
import { setLoggerPreferences, logDebug, logInfo } from "../shared/logger.js";
import { fetchLocalState } from "./localState.js";

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

const activeStrategiesList = document.getElementById("activeStrategiesList") as HTMLDivElement;
const addStrategySelect = document.getElementById("addStrategySelect") as HTMLSelectElement;

// Stats
const statTabs = document.getElementById("statTabs") as HTMLElement;
const statGroups = document.getElementById("statGroups") as HTMLElement;
const statWindows = document.getElementById("statWindows") as HTMLElement;

const progressOverlay = document.getElementById("progressOverlay") as HTMLDivElement;
const progressText = document.getElementById("progressText") as HTMLDivElement;
const progressCount = document.getElementById("progressCount") as HTMLDivElement;

const showLoading = (text: string) => {
    if (progressOverlay) {
        progressText.textContent = text;
        progressCount.textContent = "";
        progressOverlay.classList.remove("hidden");
    }
};

const hideLoading = () => {
    if (progressOverlay) {
        progressOverlay.classList.add("hidden");
    }
};

const updateProgress = (completed: number, total: number) => {
    if (progressOverlay && !progressOverlay.classList.contains("hidden")) {
        progressCount.textContent = `${completed} / ${total}`;
    }
};

let windowState: WindowView[] = [];
let focusedWindowId: number | null = null;
const selectedTabs = new Set<number>();
let initialSelectionDone = false;
let preferences: Preferences | null = null;
let localPreferencesModifiedTime = 0;

// Tree State
const expandedNodes = new Set<string>(); // Default empty = all collapsed
const TREE_ICONS = {
  chevronRight: `<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
  folder: `<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
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

const renderTabNode = (tab: TabWithGroup) => {
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

const renderGroupNode = (
    groupLabel: string,
    groupData: { color: string; tabs: TabWithGroup[] },
    windowKey: string,
    query: string
) => {
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
        tabsContainer.appendChild(renderTabNode(tab));
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

    return groupNode;
};

const renderWindowNode = (
    window: WindowView,
    visibleTabs: TabWithGroup[],
    query: string
) => {
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

    Array.from(groups.entries()).forEach(([groupLabel, groupData]) => {
        childrenContainer.appendChild(renderGroupNode(groupLabel, groupData, windowKey, query));
    });

    ungroupedTabs.forEach(tab => {
        childrenContainer.appendChild(renderTabNode(tab));
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

    return winNode;
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
    windowsContainer.appendChild(renderWindowNode(window, visibleTabs, query));
  });

  updateStats();
};

// Strategy Rendering
function updateStrategyViews(strategies: StrategyDefinition[], enabledIds: string[]) {
    // 1. Render Active Strategies
    activeStrategiesList.innerHTML = '';

    // Maintain order from enabledIds
    const enabledStrategies = enabledIds
        .map(id => strategies.find(s => s.id === id))
        .filter((s): s is StrategyDefinition => !!s);

    enabledStrategies.forEach(strategy => {
        const row = document.createElement('div');
        row.className = 'strategy-row';
        row.dataset.id = strategy.id;
        row.draggable = true;

        // Drag Handle
        const handle = document.createElement('div');
        handle.className = 'strategy-drag-handle';
        handle.innerHTML = '⋮⋮';

        // Label
        const label = document.createElement('span');
        label.className = 'strategy-label';
        label.textContent = strategy.label;

        // Tags
        let tagsHtml = '';
        if (strategy.tags) {
             strategy.tags.forEach(tag => {
                tagsHtml += `<span class="tag tag-${tag}">${tag}</span>`;
            });
        }

        const contentWrapper = document.createElement('div');
        contentWrapper.style.flex = "1";
        contentWrapper.style.display = "flex";
        contentWrapper.style.alignItems = "center";
        contentWrapper.appendChild(label);
        if (tagsHtml) {
             const tagsContainer = document.createElement('span');
             tagsContainer.innerHTML = tagsHtml;
             contentWrapper.appendChild(tagsContainer);
        }

        // Remove Button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'strategy-remove-btn';
        removeBtn.innerHTML = ICONS.close; // Use Icon for consistency
        removeBtn.title = "Remove strategy";
        removeBtn.onclick = async (e) => {
             e.stopPropagation();
             await toggleStrategy(strategy.id, false);
        };

        row.appendChild(handle);
        row.appendChild(contentWrapper);

        if (strategy.isCustom) {
             const autoRunBtn = document.createElement("button");
             autoRunBtn.className = `action-btn auto-run ${strategy.autoRun ? 'active' : ''}`;
             autoRunBtn.innerHTML = ICONS.autoRun;
             autoRunBtn.title = `Auto Run: ${strategy.autoRun ? 'ON' : 'OFF'}`;
             autoRunBtn.style.opacity = strategy.autoRun ? "1" : "0.3";
             autoRunBtn.onclick = async (e) => {
                 e.stopPropagation();
                 if (!preferences?.customStrategies) return;
                 const customStratIndex = preferences.customStrategies.findIndex(s => s.id === strategy.id);
                 if (customStratIndex !== -1) {
                    const strat = preferences.customStrategies[customStratIndex];
                    strat.autoRun = !strat.autoRun;
                    const isActive = !!strat.autoRun;
                    autoRunBtn.classList.toggle('active', isActive);
                    autoRunBtn.style.opacity = isActive ? "1" : "0.3";
                    autoRunBtn.title = `Auto Run: ${isActive ? 'ON' : 'OFF'}`;
                    localPreferencesModifiedTime = Date.now();
                    await sendMessage("savePreferences", { customStrategies: preferences.customStrategies });
                }
             };
             row.appendChild(autoRunBtn);
        }

        row.appendChild(removeBtn);

        addDnDListeners(row);
        activeStrategiesList.appendChild(row);
    });

    // 2. Render Add Strategy Options
    addStrategySelect.innerHTML = '<option value="" disabled selected>Select Strategy...</option>';

    const disabledStrategies = strategies.filter(s => !enabledIds.includes(s.id));
    disabledStrategies.sort((a, b) => a.label.localeCompare(b.label));

    // Separate strategies with Auto-Run active but not in sorting list
    const backgroundStrategies: StrategyDefinition[] = [];
    const availableStrategies: StrategyDefinition[] = [];

    disabledStrategies.forEach(s => {
        if (s.isCustom && s.autoRun) {
            backgroundStrategies.push(s);
        } else {
            availableStrategies.push(s);
        }
    });

    // Populate Select
    // We include background strategies in the dropdown too so they can be moved to "Active" sorting easily
    // but we might mark them
    [...backgroundStrategies, ...availableStrategies].sort((a, b) => a.label.localeCompare(b.label)).forEach(strategy => {
        const option = document.createElement('option');
        option.value = strategy.id;
        option.textContent = strategy.label;
        addStrategySelect.appendChild(option);
    });

    // Force selection of placeholder
    addStrategySelect.value = "";

    // 3. Render Background Strategies Section (if any)
    let bgSection = document.getElementById("backgroundStrategiesSection");
    if (backgroundStrategies.length > 0) {
        if (!bgSection) {
            bgSection = document.createElement("div");
            bgSection.id = "backgroundStrategiesSection";
            bgSection.className = "active-strategies-section";
            // Style it to look like active section but distinct
            bgSection.style.marginTop = "8px";
            bgSection.style.borderTop = "1px dashed var(--border-color)";
            bgSection.style.paddingTop = "8px";

            const header = document.createElement("div");
            header.className = "section-header";
            header.textContent = "Background Auto-Run";
            header.title = "These strategies run automatically but are not used for sorting/grouping order.";
            bgSection.appendChild(header);

            const list = document.createElement("div");
            list.className = "strategy-list";
            bgSection.appendChild(list);

            // Insert after active list
            activeStrategiesList.parentElement?.after(bgSection);
        }

        const list = bgSection.querySelector(".strategy-list") as HTMLElement;
        list.innerHTML = "";

        backgroundStrategies.forEach(strategy => {
            const row = document.createElement('div');
            row.className = 'strategy-row';
            row.dataset.id = strategy.id;

            const label = document.createElement('span');
            label.className = 'strategy-label';
            label.textContent = strategy.label;
            label.style.opacity = "0.7";

            const autoRunBtn = document.createElement("button");
            autoRunBtn.className = `action-btn auto-run active`;
            autoRunBtn.innerHTML = ICONS.autoRun;
            autoRunBtn.title = `Auto Run: ON (Click to disable)`;
            autoRunBtn.style.marginLeft = "auto";
            autoRunBtn.onclick = async (e) => {
                 e.stopPropagation();
                 if (!preferences?.customStrategies) return;
                 const customStratIndex = preferences.customStrategies.findIndex(s => s.id === strategy.id);
                 if (customStratIndex !== -1) {
                    const strat = preferences.customStrategies[customStratIndex];
                    strat.autoRun = false;
                    localPreferencesModifiedTime = Date.now();
                    await sendMessage("savePreferences", { customStrategies: preferences.customStrategies });
                    // UI update triggers via sendMessage response or re-render
                    // But we should re-render immediately for responsiveness
                    updateStrategyViews(strategies, enabledIds);
                }
            };

            row.appendChild(label);
            row.appendChild(autoRunBtn);
            list.appendChild(row);
        });
    } else {
        if (bgSection) bgSection.remove();
    }
}

async function toggleStrategy(id: string, enable: boolean) {
    if (!preferences) return;

    const allStrategies = getStrategies(preferences.customStrategies);
    const validIds = new Set(allStrategies.map(s => s.id));

    // Clean current list by removing stale IDs
    let current = (preferences.sorting || []).filter(sId => validIds.has(sId));

    if (enable) {
        if (!current.includes(id)) {
            current.push(id);
        }
    } else {
        current = current.filter(sId => sId !== id);
    }

    preferences.sorting = current;
    localPreferencesModifiedTime = Date.now();
    await sendMessage("savePreferences", { sorting: current });

    // Re-render
    updateStrategyViews(allStrategies, current);
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
    // Save order
    if (preferences) {
        const currentSorting = getSelectedSorting();
        // Check if order changed
        const oldSorting = preferences.sorting || [];
        if (JSON.stringify(currentSorting) !== JSON.stringify(oldSorting)) {
            preferences.sorting = currentSorting;
            localPreferencesModifiedTime = Date.now();
            await sendMessage("savePreferences", { sorting: currentSorting });
        }
    }
  });
}

function setupContainerDnD(container: HTMLElement) {
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY, '.strategy-row:not(.dragging)');
        const draggableRow = document.querySelector('.strategy-row.dragging');
        if (draggableRow && draggableRow.parentElement === container) {
             if (afterElement == null) {
                container.appendChild(draggableRow);
             } else {
                container.insertBefore(draggableRow, afterElement);
             }
        }
    });
}

setupContainerDnD(activeStrategiesList);

const updateUI = (
  stateData: { groups: TabGroup[]; preferences: Preferences },
  currentWindow: chrome.windows.Window | undefined,
  chromeWindows: chrome.windows.Window[],
  isPreliminary = false
) => {
    // If we modified preferences locally within the last 2 seconds, ignore the incoming preferences for sorting
    const timeSinceLocalUpdate = Date.now() - localPreferencesModifiedTime;
    const shouldUpdatePreferences = timeSinceLocalUpdate > 2000;

    if (shouldUpdatePreferences) {
        preferences = stateData.preferences;
    } else {
        // Keep local sorting/strategies, update others
        if (preferences && stateData.preferences) {
             preferences = {
                 ...stateData.preferences,
                 sorting: preferences.sorting,
                 customStrategies: preferences.customStrategies
             };
        } else if (!preferences) {
            preferences = stateData.preferences;
        }
    }

    if (preferences) {
      const s = preferences.sorting || [];

      // Initialize Logger
      setLoggerPreferences(preferences);

      const allStrategies = getStrategies(preferences.customStrategies);

      // Render unified strategy list
      updateStrategyViews(allStrategies, s);

      // Initial theme load
      if (preferences.theme) {
        applyTheme(preferences.theme, false);
      }

      // Init settings UI
      if (preferences.logLevel) {
          const select = document.getElementById('logLevelSelect') as HTMLSelectElement;
          if (select) select.value = preferences.logLevel;
      }
    }

    if (currentWindow) {
      focusedWindowId = currentWindow.id ?? null;
    } else {
      focusedWindowId = null;
      console.warn("Failed to get current window");
    }

    const windowTitles = new Map<number, string>();

    chromeWindows.forEach((win) => {
      if (!win.id) return;
      const activeTabTitle = win.tabs?.find((tab) => tab.active)?.title;
      const title = activeTabTitle ?? `Window ${win.id}`;
      windowTitles.set(win.id, title);
    });

    windowState = mapWindows(stateData.groups, windowTitles);

    if (focusedWindowId !== null) {
        windowState.sort((a, b) => {
            if (a.id === focusedWindowId) return -1;
            if (b.id === focusedWindowId) return 1;
            return 0;
        });
    }

    if (!initialSelectionDone && focusedWindowId !== null) {
        const activeWindow = windowState.find(w => w.id === focusedWindowId);
        if (activeWindow) {
             expandedNodes.add(`w-${activeWindow.id}`);
             activeWindow.tabs.forEach(t => selectedTabs.add(t.id));

             // If we successfully found and selected the window, mark as done
             initialSelectionDone = true;
        }
    }

    if (!isPreliminary) {
        initialSelectionDone = true;
    }

    renderTree();
};

const loadState = async () => {
  logInfo("Loading popup state");

  let bgFinished = false;

  const fastLoad = async () => {
    try {
        const [localRes, cw, aw] = await Promise.all([
            fetchLocalState(),
            chrome.windows.getCurrent().catch(() => undefined),
            chrome.windows.getAll({ windowTypes: ["normal"], populate: true }).catch(() => [])
        ]);

        // Only update if background hasn't finished yet
        if (!bgFinished && localRes.ok && localRes.data) {
             updateUI(localRes.data, cw, aw as chrome.windows.Window[], true);
        }
    } catch (e) {
        console.warn("Fast load failed", e);
    }
  };

  const bgLoad = async () => {
    try {
        const [bgRes, cw, aw] = await Promise.all([
            fetchState(),
            chrome.windows.getCurrent().catch(() => undefined),
            chrome.windows.getAll({ windowTypes: ["normal"], populate: true }).catch(() => [])
        ]);

        bgFinished = true; // Mark as finished so fast load doesn't overwrite if it's somehow slow

        if (bgRes.ok && bgRes.data) {
             updateUI(bgRes.data, cw, aw as chrome.windows.Window[]);
        } else {
            console.error("Failed to load state:", bgRes.error ?? "Unknown error");
            if (windowState.length === 0) { // Only show error if we have NOTHING shown
                windowsContainer.innerHTML = `<div class="error-state" style="padding: 20px; color: var(--error-color, red); text-align: center;">
                    Failed to load tabs: ${bgRes.error ?? "Unknown error"}.<br>
                    Please reload the extension or check permissions.
                </div>`;
            }
        }
    } catch (e) {
        console.error("Error loading state:", e);
    }
  };

  // Start both concurrently
  await Promise.all([fastLoad(), bgLoad()]);
};

const getSelectedSorting = (): SortingStrategy[] => {
    // Read from DOM to get current order of active strategies
    return Array.from(activeStrategiesList.children)
        .map(row => (row as HTMLElement).dataset.id as SortingStrategy);
};

// Add listener for select
addStrategySelect.addEventListener('change', async (e) => {
    const select = e.target as HTMLSelectElement;
    const id = select.value;
    if (id) {
        await toggleStrategy(id, true);
        select.value = ""; // Reset to placeholder
    }
});

const triggerGroup = async (selection?: GroupingSelection) => {
    logInfo("Triggering grouping", { selection });
    showLoading("Applying Strategy...");
    try {
        const sorting = getSelectedSorting();
        await applyGrouping({ selection, sorting });
        await loadState();
    } finally {
        hideLoading();
    }
};

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'groupingProgress') {
        const { completed, total } = message.payload;
        updateProgress(completed, total);
    }
});

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

btnApply?.addEventListener("click", () => {
    logInfo("Apply button clicked", { selectedCount: selectedTabs.size });
    triggerGroup({ tabIds: Array.from(selectedTabs) });
});

btnUngroup.addEventListener("click", async () => {
  if (confirm(`Ungroup ${selectedTabs.size} tabs?`)) {
      logInfo("Ungrouping tabs", { count: selectedTabs.size });
      await chrome.tabs.ungroup(Array.from(selectedTabs));
      await loadState();
  }
});
btnMerge.addEventListener("click", async () => {
  if (confirm(`Merge ${selectedTabs.size} tabs into one group?`)) {
      logInfo("Merging tabs", { count: selectedTabs.size });
      const res = await sendMessage("mergeSelection", { tabIds: Array.from(selectedTabs) });
      if (!res.ok) alert("Merge failed: " + res.error);
      else await loadState();
  }
});
btnSplit.addEventListener("click", async () => {
  if (confirm(`Split ${selectedTabs.size} tabs into a new window?`)) {
      logInfo("Splitting tabs", { count: selectedTabs.size });
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


document.getElementById("btnUndo")?.addEventListener("click", async () => {
  logInfo("Undo clicked");
  const res = await sendMessage("undo");
  if (!res.ok) alert("Undo failed: " + res.error);
});

document.getElementById("btnSaveState")?.addEventListener("click", async () => {
  const name = prompt("Enter a name for this state:");
  if (name) {
    logInfo("Saving state", { name });
    const res = await sendMessage("saveState", { name });
    if (!res.ok) alert("Save failed: " + res.error);
  }
});

const loadStateDialog = document.getElementById("loadStateDialog") as HTMLDialogElement;
const savedStateList = document.getElementById("savedStateList") as HTMLElement;

document.getElementById("btnLoadState")?.addEventListener("click", async () => {
  logInfo("Opening Load State dialog");
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
          logInfo("Restoring state", { name: state.name });
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
        logInfo("Applying theme", { theme });
        localPreferencesModifiedTime = Date.now();
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

// --- Settings Logic ---
const settingsDialog = document.getElementById("settingsDialog") as HTMLDialogElement;
document.getElementById("btnSettings")?.addEventListener("click", () => {
    settingsDialog.showModal();
});
document.getElementById("btnCloseSettings")?.addEventListener("click", () => {
    settingsDialog.close();
});

const logLevelSelect = document.getElementById("logLevelSelect") as HTMLSelectElement;
logLevelSelect?.addEventListener("change", async () => {
    const newLevel = logLevelSelect.value as LogLevel;
    if (preferences) {
        preferences.logLevel = newLevel;
        // Update local logger immediately
        setLoggerPreferences(preferences);
        // Persist
        localPreferencesModifiedTime = Date.now();
        await sendMessage("savePreferences", { logLevel: newLevel });
        logDebug("Log level updated", { level: newLevel });
    }
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
