"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_js_1 = require("./common.js");
const strategyRegistry_js_1 = require("../shared/strategyRegistry.js");
const logger_js_1 = require("../shared/logger.js");
const localState_js_1 = require("./localState.js");
// Elements
const searchInput = document.getElementById("tabSearch");
const windowsContainer = document.getElementById("windows");
const selectAllCheckbox = document.getElementById("selectAll");
const btnApply = document.getElementById("btnApply");
const btnUngroup = document.getElementById("btnUngroup");
const btnMerge = document.getElementById("btnMerge");
const btnSplit = document.getElementById("btnSplit");
const btnExpandAll = document.getElementById("btnExpandAll");
const btnCollapseAll = document.getElementById("btnCollapseAll");
const strategiesList = document.getElementById("strategiesList");
const toggleStrategies = document.getElementById("toggleStrategies");
const allStrategiesContainer = document.getElementById("all-strategies");
// Stats
const statTabs = document.getElementById("statTabs");
const statGroups = document.getElementById("statGroups");
const statWindows = document.getElementById("statWindows");
const progressOverlay = document.getElementById("progressOverlay");
const progressText = document.getElementById("progressText");
const progressCount = document.getElementById("progressCount");
const showLoading = (text) => {
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
const updateProgress = (completed, total) => {
    if (progressOverlay && !progressOverlay.classList.contains("hidden")) {
        progressCount.textContent = `${completed} / ${total}`;
    }
};
let windowState = [];
let focusedWindowId = null;
const selectedTabs = new Set();
let initialSelectionDone = false;
let preferences = null;
// Tree State
const expandedNodes = new Set(); // Default empty = all collapsed
const TREE_ICONS = {
    chevronRight: `<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
    folder: `<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
};
const hexToRgba = (hex, alpha) => {
    // Ensure hex format
    if (!hex.startsWith('#'))
        return hex;
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
    }
    else if (selectedTabs.size === totalTabs) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    }
    else if (selectedTabs.size > 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    }
    else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
};
const createNode = (content, childrenContainer, level, isExpanded = false, onToggle) => {
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
            if (onToggle)
                onToggle();
        };
    }
    else {
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
            if (e.target.closest('.action-btn') || e.target.closest('.tree-checkbox'))
                return;
            if (onToggle)
                onToggle();
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
        if (!query)
            return { window, visibleTabs: window.tabs };
        const visibleTabs = window.tabs.filter((tab) => tab.title.toLowerCase().includes(query) || tab.url.toLowerCase().includes(query));
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
                if (targetState)
                    selectedTabs.add(id);
                else
                    selectedTabs.delete(id);
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
        const groups = new Map();
        const ungroupedTabs = [];
        visibleTabs.forEach(tab => {
            if (tab.groupLabel) {
                const key = tab.groupLabel;
                const entry = groups.get(key) ?? { color: tab.groupColor, tabs: [] };
                entry.tabs.push(tab);
                groups.set(key, entry);
            }
            else {
                ungroupedTabs.push(tab);
            }
        });
        const createTabNode = (tab) => {
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
                if (tabCheckbox.checked)
                    selectedTabs.add(tab.id);
                else
                    selectedTabs.delete(tab.id);
                renderTree();
            };
            const tabIcon = document.createElement("div");
            tabIcon.className = "tree-icon";
            if (tab.favIconUrl) {
                const img = document.createElement("img");
                img.src = tab.favIconUrl;
                img.onerror = () => { tabIcon.innerHTML = common_js_1.ICONS.defaultFile; };
                tabIcon.appendChild(img);
            }
            else {
                tabIcon.innerHTML = common_js_1.ICONS.defaultFile;
            }
            const tabTitle = document.createElement("div");
            tabTitle.className = "tree-label";
            tabTitle.textContent = tab.title;
            tabTitle.title = tab.title;
            const tabActions = document.createElement("div");
            tabActions.className = "row-actions";
            const closeBtn = document.createElement("button");
            closeBtn.className = "action-btn delete";
            closeBtn.innerHTML = common_js_1.ICONS.close;
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
                if (e.target.closest('.tree-checkbox'))
                    return;
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
                    if (targetState)
                        selectedTabs.add(id);
                    else
                        selectedTabs.delete(id);
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
            ungroupBtn.innerHTML = common_js_1.ICONS.ungroup;
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
            const { node: groupNode, toggle: grpToggle, childrenContainer: grpChildren } = createNode(grpContent, tabsContainer, 'group', isGroupExpanded, () => {
                if (expandedNodes.has(groupKey))
                    expandedNodes.delete(groupKey);
                else
                    expandedNodes.add(groupKey);
                const expanded = expandedNodes.has(groupKey);
                grpToggle.classList.toggle('rotated', expanded);
                grpChildren.classList.toggle('expanded', expanded);
            });
            // Apply background color to group node
            if (groupData.color) {
                const colorName = groupData.color;
                const hex = common_js_1.GROUP_COLORS[colorName] || colorName; // Fallback if it's already hex
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
        const { node: winNode, toggle: winToggle, childrenContainer: winChildren } = createNode(winContent, childrenContainer, 'window', isExpanded, () => {
            if (expandedNodes.has(windowKey))
                expandedNodes.delete(windowKey);
            else
                expandedNodes.add(windowKey);
            const expanded = expandedNodes.has(windowKey);
            winToggle.classList.toggle('rotated', expanded);
            winChildren.classList.toggle('expanded', expanded);
        });
        windowsContainer.appendChild(winNode);
    });
    updateStats();
};
// Strategy Rendering
function renderStrategyList(container, strategies, defaultEnabled) {
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
        let tagsHtml = '';
        if (strategy.tags) {
            strategy.tags.forEach(tag => {
                tagsHtml += `<span class="tag tag-${tag}">${tag}</span>`;
            });
        }
        row.innerHTML = `
            <div class="strategy-drag-handle">☰</div>
            <input type="checkbox" ${isChecked ? 'checked' : ''}>
            <span class="strategy-label">${strategy.label}</span>
            ${tagsHtml}
        `;
        if (strategy.isCustom) {
            const autoRunBtn = document.createElement("button");
            autoRunBtn.className = `action-btn auto-run ${strategy.autoRun ? 'active' : ''}`;
            autoRunBtn.innerHTML = common_js_1.ICONS.autoRun;
            autoRunBtn.title = `Auto Run: ${strategy.autoRun ? 'ON' : 'OFF'}`;
            autoRunBtn.style.marginLeft = "auto";
            autoRunBtn.style.opacity = strategy.autoRun ? "1" : "0.3";
            autoRunBtn.onclick = async (e) => {
                e.stopPropagation();
                if (!preferences?.customStrategies)
                    return;
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
                    await (0, common_js_1.sendMessage)("savePreferences", { customStrategies: preferences.customStrategies });
                    // No need to reload state entirely for this, but if we wanted to reflect changes that depend on it...
                    // loadState();
                }
            };
            row.appendChild(autoRunBtn);
        }
        // Add listeners
        const checkbox = row.querySelector('input[type="checkbox"]');
        checkbox?.addEventListener('change', async (e) => {
            const checked = e.target.checked;
            row.classList.toggle('active', checked);
            (0, logger_js_1.logInfo)("Strategy toggled", { id: strategy.id, checked });
            // Immediate save on interaction
            if (preferences) {
                // Update local preference state
                const currentSorting = getSelectedSorting();
                preferences.sorting = currentSorting;
                // We should also persist this to storage, so if user reloads they see it
                await (0, common_js_1.sendMessage)("savePreferences", { sorting: currentSorting });
            }
        });
        // Basic Click to toggle (for better UX)
        row.addEventListener('click', (e) => {
            if (e.target.closest('.action-btn'))
                return;
            if (e.target !== checkbox) {
                checkbox.click();
            }
        });
        addDnDListeners(row);
        container.appendChild(row);
    });
}
function addDnDListeners(row) {
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
            await (0, common_js_1.sendMessage)("savePreferences", { sorting: currentSorting });
        }
    });
}
function setupContainerDnD(container) {
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY);
        // Scope draggable to be a strategy-row
        const draggableRow = document.querySelector('.strategy-row.dragging');
        // Ensure we only drag within the same container (prevent cross-list dragging)
        if (draggableRow && draggableRow.parentElement === container) {
            if (afterElement == null) {
                container.appendChild(draggableRow);
            }
            else {
                container.insertBefore(draggableRow, afterElement);
            }
        }
    });
}
// Initialize DnD on containers once
setupContainerDnD(allStrategiesContainer);
function getDragAfterElement(container, y) {
    const draggableElements = Array.from(container.querySelectorAll('.strategy-row:not(.dragging)'));
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        }
        else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}
const updateUI = (stateData, currentWindow, chromeWindows, isPreliminary = false) => {
    preferences = stateData.preferences;
    if (preferences) {
        const s = preferences.sorting || [];
        // Initialize Logger
        (0, logger_js_1.setLoggerPreferences)(preferences);
        const allStrategies = (0, strategyRegistry_js_1.getStrategies)(preferences.customStrategies);
        // Render unified strategy list
        renderStrategyList(allStrategiesContainer, allStrategies, s);
        // Initial theme load
        if (preferences.theme) {
            applyTheme(preferences.theme, false);
        }
        // Init settings UI
        if (preferences.logLevel) {
            const select = document.getElementById('logLevelSelect');
            if (select)
                select.value = preferences.logLevel;
        }
    }
    if (currentWindow) {
        focusedWindowId = currentWindow.id ?? null;
    }
    else {
        focusedWindowId = null;
        console.warn("Failed to get current window");
    }
    const windowTitles = new Map();
    chromeWindows.forEach((win) => {
        if (!win.id)
            return;
        const activeTabTitle = win.tabs?.find((tab) => tab.active)?.title;
        const title = activeTabTitle ?? `Window ${win.id}`;
        windowTitles.set(win.id, title);
    });
    windowState = (0, common_js_1.mapWindows)(stateData.groups, windowTitles);
    if (focusedWindowId !== null) {
        windowState.sort((a, b) => {
            if (a.id === focusedWindowId)
                return -1;
            if (b.id === focusedWindowId)
                return 1;
            return 0;
        });
    }
    if (!initialSelectionDone && focusedWindowId !== null) {
        const activeWindow = windowState.find(w => w.id === focusedWindowId);
        if (activeWindow) {
            expandedNodes.add(`w-${activeWindow.id}`);
            activeWindow.tabs.forEach(t => selectedTabs.add(t.id));
            if (!isPreliminary) {
                initialSelectionDone = true;
            }
        }
    }
    renderTree();
};
const loadState = async () => {
    (0, logger_js_1.logInfo)("Loading popup state");
    let bgFinished = false;
    const fastLoad = async () => {
        try {
            const [localRes, cw, aw] = await Promise.all([
                (0, localState_js_1.fetchLocalState)(),
                chrome.windows.getCurrent().catch(() => undefined),
                chrome.windows.getAll({ windowTypes: ["normal"], populate: true }).catch(() => [])
            ]);
            // Only update if background hasn't finished yet
            if (!bgFinished && localRes.ok && localRes.data) {
                updateUI(localRes.data, cw, aw, true);
            }
        }
        catch (e) {
            console.warn("Fast load failed", e);
        }
    };
    const bgLoad = async () => {
        try {
            const [bgRes, cw, aw] = await Promise.all([
                (0, common_js_1.fetchState)(),
                chrome.windows.getCurrent().catch(() => undefined),
                chrome.windows.getAll({ windowTypes: ["normal"], populate: true }).catch(() => [])
            ]);
            bgFinished = true; // Mark as finished so fast load doesn't overwrite if it's somehow slow
            if (bgRes.ok && bgRes.data) {
                updateUI(bgRes.data, cw, aw);
            }
            else {
                console.error("Failed to load state:", bgRes.error ?? "Unknown error");
                if (windowState.length === 0) { // Only show error if we have NOTHING shown
                    windowsContainer.innerHTML = `<div class="error-state" style="padding: 20px; color: var(--error-color, red); text-align: center;">
                    Failed to load tabs: ${bgRes.error ?? "Unknown error"}.<br>
                    Please reload the extension or check permissions.
                </div>`;
                }
            }
        }
        catch (e) {
            console.error("Error loading state:", e);
        }
    };
    // Start both concurrently
    await Promise.all([fastLoad(), bgLoad()]);
};
const getStrategyIds = (container) => {
    return Array.from(container.children)
        .filter(row => row.querySelector('input[type="checkbox"]').checked)
        .map(row => row.dataset.id);
};
const getSelectedSorting = () => {
    // Use the single unified container
    return getStrategyIds(allStrategiesContainer);
};
const triggerGroup = async (selection) => {
    (0, logger_js_1.logInfo)("Triggering grouping", { selection });
    showLoading("Applying Strategy...");
    try {
        const sorting = getSelectedSorting();
        await (0, common_js_1.applyGrouping)({ selection, sorting });
        await loadState();
    }
    finally {
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
    const targetState = e.target.checked;
    if (targetState) {
        // Select All
        windowState.forEach(win => {
            win.tabs.forEach(tab => selectedTabs.add(tab.id));
        });
    }
    else {
        // Deselect All
        selectedTabs.clear();
    }
    renderTree();
});
btnApply?.addEventListener("click", () => {
    (0, logger_js_1.logInfo)("Apply button clicked", { selectedCount: selectedTabs.size });
    triggerGroup({ tabIds: Array.from(selectedTabs) });
});
btnUngroup.addEventListener("click", async () => {
    if (confirm(`Ungroup ${selectedTabs.size} tabs?`)) {
        (0, logger_js_1.logInfo)("Ungrouping tabs", { count: selectedTabs.size });
        await chrome.tabs.ungroup(Array.from(selectedTabs));
        await loadState();
    }
});
btnMerge.addEventListener("click", async () => {
    if (confirm(`Merge ${selectedTabs.size} tabs into one group?`)) {
        (0, logger_js_1.logInfo)("Merging tabs", { count: selectedTabs.size });
        const res = await (0, common_js_1.sendMessage)("mergeSelection", { tabIds: Array.from(selectedTabs) });
        if (!res.ok)
            alert("Merge failed: " + res.error);
        else
            await loadState();
    }
});
btnSplit.addEventListener("click", async () => {
    if (confirm(`Split ${selectedTabs.size} tabs into a new window?`)) {
        (0, logger_js_1.logInfo)("Splitting tabs", { count: selectedTabs.size });
        const res = await (0, common_js_1.sendMessage)("splitSelection", { tabIds: Array.from(selectedTabs) });
        if (!res.ok)
            alert("Split failed: " + res.error);
        else
            await loadState();
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
    (0, logger_js_1.logInfo)("Undo clicked");
    const res = await (0, common_js_1.sendMessage)("undo");
    if (!res.ok)
        alert("Undo failed: " + res.error);
});
document.getElementById("btnSaveState")?.addEventListener("click", async () => {
    const name = prompt("Enter a name for this state:");
    if (name) {
        (0, logger_js_1.logInfo)("Saving state", { name });
        const res = await (0, common_js_1.sendMessage)("saveState", { name });
        if (!res.ok)
            alert("Save failed: " + res.error);
    }
});
const loadStateDialog = document.getElementById("loadStateDialog");
const savedStateList = document.getElementById("savedStateList");
document.getElementById("btnLoadState")?.addEventListener("click", async () => {
    (0, logger_js_1.logInfo)("Opening Load State dialog");
    const res = await (0, common_js_1.sendMessage)("getSavedStates");
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
                    (0, logger_js_1.logInfo)("Restoring state", { name: state.name });
                    const r = await (0, common_js_1.sendMessage)("restoreState", { state });
                    if (r.ok) {
                        loadStateDialog.close();
                        window.close();
                    }
                    else {
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
                    await (0, common_js_1.sendMessage)("deleteSavedState", { name: state.name });
                    li.remove();
                }
            };
            li.appendChild(span);
            li.appendChild(delBtn);
            savedStateList.appendChild(li);
        });
        loadStateDialog.showModal();
    }
    else {
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
const applyTheme = (theme, save = false) => {
    if (theme === 'light') {
        document.body.classList.add('light-mode');
        if (iconSun)
            iconSun.style.display = 'block';
        if (iconMoon)
            iconMoon.style.display = 'none';
    }
    else {
        document.body.classList.remove('light-mode');
        if (iconSun)
            iconSun.style.display = 'none';
        if (iconMoon)
            iconMoon.style.display = 'block';
    }
    // Sync with Preferences
    if (save) {
        // We use savePreferences which calls the background to store it
        (0, logger_js_1.logInfo)("Applying theme", { theme });
        (0, common_js_1.sendMessage)("savePreferences", { theme });
    }
};
// Initial load fallback (before loadState loads prefs)
const storedTheme = localStorage.getItem('theme');
// If we have a local override, use it temporarily, but loadState will authoritative check prefs
if (storedTheme)
    applyTheme(storedTheme, false);
btnTheme?.addEventListener('click', () => {
    const isLight = document.body.classList.contains('light-mode');
    const newTheme = isLight ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme); // Keep local copy for fast boot
    applyTheme(newTheme, true);
});
// --- Settings Logic ---
const settingsDialog = document.getElementById("settingsDialog");
document.getElementById("btnSettings")?.addEventListener("click", () => {
    settingsDialog.showModal();
});
document.getElementById("btnCloseSettings")?.addEventListener("click", () => {
    settingsDialog.close();
});
const logLevelSelect = document.getElementById("logLevelSelect");
logLevelSelect?.addEventListener("change", async () => {
    const newLevel = logLevelSelect.value;
    if (preferences) {
        preferences.logLevel = newLevel;
        // Update local logger immediately
        (0, logger_js_1.setLoggerPreferences)(preferences);
        // Persist
        await (0, common_js_1.sendMessage)("savePreferences", { logLevel: newLevel });
        (0, logger_js_1.logDebug)("Log level updated", { level: newLevel });
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
    const saveSize = (w, h) => {
        localStorage.setItem("popupSize", JSON.stringify({ width: w, height: h }));
    };
    resizeHandle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = document.body.offsetWidth;
        const startHeight = document.body.offsetHeight;
        const onMouseMove = (ev) => {
            const newWidth = Math.max(500, startWidth + (ev.clientX - startX));
            const newHeight = Math.max(500, startHeight + (ev.clientY - startY));
            document.body.style.width = `${newWidth}px`;
            document.body.style.height = `${newHeight}px`;
        };
        const onMouseUp = (ev) => {
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
            if (btnPin)
                btnPin.style.display = "none";
            // Enable resize handle in pinned mode if it was hidden
            if (resizeHandle)
                resizeHandle.style.display = "block";
            document.body.style.width = "100%";
            document.body.style.height = "100%";
        }
        else {
            // Disable resize handle in docked mode
            if (resizeHandle)
                resizeHandle.style.display = "none";
            // Clear any previous size overrides
            document.body.style.width = "";
            document.body.style.height = "";
        }
    }
    catch (e) {
        console.error("Error checking window type:", e);
    }
};
adjustForWindowType();
loadState().catch(e => console.error("Load state failed", e));
