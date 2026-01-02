import { applyGrouping, applySorting, fetchState, formatDomain, getGroupColor, ICONS, mapWindows, sendMessage } from "./common.js";
// Elements
const searchInput = document.getElementById("tabSearch");
const windowsContainer = document.getElementById("windows");
const sortPinned = document.getElementById("sortPinnedFlyout");
const sortRecency = document.getElementById("sortRecencyFlyout");
const sortHierarchy = document.getElementById("sortHierarchyFlyout");
const sortTitle = document.getElementById("sortTitleFlyout");
const sortUrl = document.getElementById("sortUrlFlyout");
const sortContext = document.getElementById("sortContextFlyout");
const btnSortSelected = document.getElementById("btnSortSelected");
const btnGroupSelected = document.getElementById("btnGroupSelected");
const btnSortAll = document.getElementById("btnSortAll");
const btnGroupAll = document.getElementById("btnGroupAll");
// Footer Stats
const footerTotalTabs = document.getElementById("footerTotalTabs");
const footerTotalGroups = document.getElementById("footerTotalGroups");
const footerExtraStat = document.getElementById("footerExtraStat");
const footerPinned = document.getElementById("footerPinned");
let windowState = [];
let focusedWindowId = null;
const expandedWindows = new Set();
const selectedWindows = new Set();
const selectedTabs = new Set();
let preferences = null;
let sortingInitialized = false;
const pruneSelections = () => {
    const availableWindows = new Set(windowState.map((window) => window.id));
    const availableTabs = new Set();
    windowState.forEach((window) => {
        window.tabs.forEach((tab) => availableTabs.add(tab.id));
    });
    Array.from(selectedWindows).forEach((id) => {
        if (!availableWindows.has(id))
            selectedWindows.delete(id);
    });
    Array.from(selectedTabs).forEach((id) => {
        if (!availableTabs.has(id))
            selectedTabs.delete(id);
    });
};
const toggleWindowSelection = (window, checked) => {
    if (checked) {
        selectedWindows.add(window.id);
        window.tabs.forEach((tab) => selectedTabs.add(tab.id));
    }
    else {
        selectedWindows.delete(window.id);
        window.tabs.forEach((tab) => selectedTabs.delete(tab.id));
    }
};
const buildSelectionPayload = () => {
    return {
        windowIds: Array.from(selectedWindows),
        tabIds: Array.from(selectedTabs)
    };
};
const triggerReGroupSelected = async () => {
    const selection = buildSelectionPayload();
    const sorting = getSelectedSorting();
    await applyGrouping({ selection, sorting });
    await loadState();
};
const triggerSortSelected = async () => {
    const selection = buildSelectionPayload();
    const sorting = getSelectedSorting();
    await applySorting({ selection, sorting });
    await loadState();
};
const triggerReGroupAll = async () => {
    const sorting = getSelectedSorting();
    await applyGrouping({ sorting });
    await loadState();
};
const triggerSortAll = async () => {
    const sorting = getSelectedSorting();
    await applySorting({ sorting });
    await loadState();
};
const applySortingSelection = (sorting) => {
    sortPinned.checked = sorting.includes("pinned");
    sortRecency.checked = sorting.includes("recency");
    sortHierarchy.checked = sorting.includes("hierarchy");
    sortTitle.checked = sorting.includes("title");
    sortUrl.checked = sorting.includes("url");
    sortContext.checked = sorting.includes("context");
};
const getSelectedSorting = () => {
    const selected = [];
    if (sortPinned.checked)
        selected.push("pinned");
    if (sortRecency.checked)
        selected.push("recency");
    if (sortHierarchy.checked)
        selected.push("hierarchy");
    if (sortTitle.checked)
        selected.push("title");
    if (sortUrl.checked)
        selected.push("url");
    if (sortContext.checked)
        selected.push("context");
    if (selected.length === 0) {
        return preferences?.sorting ?? ["pinned", "recency"];
    }
    return selected;
};
const getDOMSorting = () => {
    const selected = [];
    if (sortPinned.checked)
        selected.push("pinned");
    if (sortRecency.checked)
        selected.push("recency");
    if (sortHierarchy.checked)
        selected.push("hierarchy");
    if (sortTitle.checked)
        selected.push("title");
    if (sortUrl.checked)
        selected.push("url");
    if (sortContext.checked)
        selected.push("context");
    return selected;
};
const saveSortingState = async () => {
    const sorting = getDOMSorting();
    // We explicitly want to save the current state, even if it's empty.
    await chrome.runtime.sendMessage({ type: "savePreferences", payload: { sorting } });
    // Update local preferences to reflect the change immediately
    if (preferences) {
        preferences.sorting = sorting;
    }
};
// --- Render Logic ---
const updateFooter = () => {
    const totalTabs = windowState.reduce((acc, win) => acc + win.tabCount, 0);
    const totalPinned = windowState.reduce((acc, win) => acc + win.pinnedCount, 0);
    // Calculate total groups across all windows
    const allGroups = new Set();
    windowState.forEach(win => {
        win.tabs.forEach(t => allGroups.add(`${t.windowId}-${t.groupLabel}`));
    });
    // Update footer text
    footerTotalTabs.textContent = `${totalTabs} tabs`;
    footerTotalGroups.textContent = `${allGroups.size} groups`;
    footerExtraStat.textContent = `${windowState.length} windows`;
    footerPinned.textContent = `${totalPinned} pinned`;
};
const renderGroupItems = (tabs) => {
    const list = document.createElement("div");
    list.className = "group-list";
    // Group tabs by label
    const groups = new Map();
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
        const headerLabel = document.createElement("span");
        headerLabel.textContent = label;
        header.appendChild(headerLabel);
        const ungroupBtn = document.createElement("button");
        ungroupBtn.className = "group-action-btn";
        ungroupBtn.innerHTML = ICONS.ungroup;
        ungroupBtn.title = "Ungroup tabs";
        ungroupBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (confirm(`Ungroup ${group.tabs.length} tabs from "${label}"?`)) {
                const tabIds = group.tabs.map((t) => t.id);
                await chrome.tabs.ungroup(tabIds);
                await loadState();
            }
        });
        header.appendChild(ungroupBtn);
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
            }
            else {
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
            // Close Tab Button
            const closeBtn = document.createElement("button");
            closeBtn.className = "tab-close-btn";
            closeBtn.innerHTML = ICONS.close;
            closeBtn.title = "Close tab";
            closeBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                await chrome.tabs.remove(tab.id);
                await loadState();
            });
            item.appendChild(closeBtn);
            // Click to jump to tab
            item.addEventListener("click", async () => {
                await chrome.tabs.update(tab.id, { active: true });
                await chrome.windows.update(tab.windowId, { focused: true });
            });
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
        if (!query)
            return { window, visibleTabs: window.tabs };
        const visibleTabs = window.tabs.filter((tab) => tab.title.toLowerCase().includes(query) || tab.url.toLowerCase().includes(query));
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
            const checked = event.target.checked;
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
        const createActionBtn = (icon, label, onClick, isActive = false) => {
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
        actions.append(createActionBtn(ICONS.active, "Active", async () => {
            await chrome.windows.update(window.id, { focused: true });
        }, isActiveWindow), createActionBtn(expanded ? ICONS.hide : ICONS.show, expanded ? "Hide" : "Show", () => {
            if (expandedWindows.has(window.id)) {
                expandedWindows.delete(window.id);
            }
            else {
                expandedWindows.add(window.id);
            }
            renderWindows();
        }), createActionBtn(ICONS.focus, "Focus", async () => {
            await chrome.windows.update(window.id, { focused: true });
        }), createActionBtn(ICONS.close, "Close", async () => {
            if (confirm("Are you sure you want to close this window?")) {
                await chrome.windows.remove(window.id);
                await loadState();
            }
        }));
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
    if (!state.ok || !state.data)
        return;
    preferences = state.data.preferences;
    if (!sortingInitialized) {
        applySortingSelection(preferences.sorting);
        sortingInitialized = true;
    }
    focusedWindowId = currentWindow?.id ?? null;
    const windowTitles = new Map();
    chromeWindows.forEach((win) => {
        if (!win.id)
            return;
        const activeTabTitle = win.tabs?.find((tab) => tab.active)?.title;
        const firstTabTitle = win.tabs?.[0]?.title;
        const title = activeTabTitle ?? firstTabTitle ?? `Window ${win.id}`;
        windowTitles.set(win.id, title);
    });
    windowState = mapWindows(state.data.groups, windowTitles);
    if (windowState.length && expandedWindows.size === 0) {
        const initial = windowState.find((win) => win.id === focusedWindowId) ?? windowState[0];
        if (initial)
            expandedWindows.add(initial.id);
    }
    pruneSelections();
    renderWindows();
};
const initialize = async () => {
    await loadState();
};
// Event Listeners for Sort Toggles
// Note: We removed auto-triggering on sort change.
// The user must click "Sort" or "Group" explicitly.
// But we might want to persist the selection locally or just rely on the UI state when button is clicked.
// Since getSelectedSorting() reads from DOM, we don't need to do anything on change except maybe visual feedback if we had it.
[sortPinned, sortRecency, sortHierarchy, sortTitle, sortUrl, sortContext].forEach(el => {
    el.addEventListener("change", saveSortingState);
});
btnSortSelected.addEventListener("click", triggerSortSelected);
btnGroupSelected.addEventListener("click", triggerReGroupSelected);
btnSortAll.addEventListener("click", triggerSortAll);
btnGroupAll.addEventListener("click", triggerReGroupAll);
document.getElementById("btnUndo")?.addEventListener("click", async () => {
    const res = await sendMessage("undo");
    if (!res.ok)
        alert("Undo failed: " + res.error);
});
document.getElementById("btnSaveState")?.addEventListener("click", async () => {
    const name = prompt("Enter a name for this state:");
    if (name) {
        const res = await sendMessage("saveState", { name });
        if (!res.ok)
            alert("Save failed: " + res.error);
    }
});
const loadStateDialog = document.getElementById("loadStateDialog");
const savedStateList = document.getElementById("savedStateList");
document.getElementById("btnLoadState")?.addEventListener("click", async () => {
    const res = await sendMessage("getSavedStates");
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
                        window.close(); // Close popup to let background work
                    }
                    else {
                        alert("Restore failed: " + r.error);
                    }
                }
            };
            const delBtn = document.createElement("button");
            delBtn.textContent = "Delete";
            delBtn.style.marginLeft = "8px";
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
    }
    else {
        alert("Failed to load states: " + res.error);
    }
});
document.getElementById("btnCloseLoadState")?.addEventListener("click", () => {
    loadStateDialog.close();
});
// Keep search listener
searchInput.addEventListener("input", renderWindows);
// Auto-refresh?
chrome.tabs.onUpdated.addListener(() => loadState());
chrome.tabs.onRemoved.addListener(() => loadState());
chrome.windows.onRemoved.addListener(() => loadState());
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
            const newWidth = Math.max(400, startWidth + (ev.clientX - startX));
            const newHeight = Math.max(400, startHeight + (ev.clientY - startY));
            document.body.style.width = `${newWidth}px`;
            document.body.style.height = `${newHeight}px`;
        };
        const onMouseUp = (ev) => {
            const newWidth = Math.max(400, startWidth + (ev.clientX - startX));
            const newHeight = Math.max(400, startHeight + (ev.clientY - startY));
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
            // Pinned window mode: use full window size, hide resize handle and pin button
            if (resizeHandle)
                resizeHandle.style.display = "none";
            if (btnPin)
                btnPin.style.display = "none";
            document.body.style.width = "100%";
            document.body.style.height = "100%";
        }
        else {
            // Bubble mode: restore saved size
            const savedSize = localStorage.getItem("popupSize");
            if (savedSize) {
                try {
                    const { width, height } = JSON.parse(savedSize);
                    if (width && height) {
                        document.body.style.width = `${Math.max(400, width)}px`;
                        document.body.style.height = `${Math.max(400, height)}px`;
                    }
                }
                catch { }
            }
        }
    }
    catch (e) {
        console.error("Error checking window type:", e);
    }
};
adjustForWindowType();
initialize();
