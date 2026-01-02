import { applyGrouping, applySorting, fetchState, mapWindows, sendMessage } from "./common.js";
const searchInput = document.getElementById("tabSearch");
const windowsContainer = document.getElementById("windows");
const btnSort = document.getElementById("btnSort");
const btnGroup = document.getElementById("btnGroup");
const btnUndo = document.getElementById("btnUndo");
// Sort Toggles
const sortPinned = document.getElementById("sortPinned");
const sortRecency = document.getElementById("sortRecency");
const sortContext = document.getElementById("sortContext");
const sortUrl = document.getElementById("sortUrl");
let windowState = [];
let preferences = null;
const render = () => {
    const query = searchInput.value.trim().toLowerCase();
    windowsContainer.innerHTML = "";
    windowState.forEach(win => {
        const visibleTabs = win.tabs.filter(t => !query || t.title.toLowerCase().includes(query) || t.url.toLowerCase().includes(query));
        if (visibleTabs.length === 0)
            return;
        const card = document.createElement("div");
        card.className = "window-card";
        const header = document.createElement("div");
        header.className = "window-header";
        header.textContent = `${win.title} (${visibleTabs.length})`;
        card.appendChild(header);
        // Group by label
        const groups = new Map();
        visibleTabs.forEach(t => {
            if (!groups.has(t.groupLabel))
                groups.set(t.groupLabel, []);
            groups.get(t.groupLabel).push(t);
        });
        groups.forEach((tabs, label) => {
            const groupHeader = document.createElement("div");
            groupHeader.className = "group-header";
            groupHeader.textContent = label;
            card.appendChild(groupHeader);
            tabs.forEach((tab) => {
                const item = document.createElement("div");
                item.className = "tab-item";
                item.title = tab.title;
                const icon = document.createElement("div");
                icon.className = "tab-icon";
                if (tab.favIconUrl) {
                    const img = document.createElement("img");
                    img.src = tab.favIconUrl;
                    icon.appendChild(img);
                }
                const title = document.createElement("div");
                title.className = "tab-title";
                title.textContent = tab.title;
                item.append(icon, title);
                item.onclick = () => {
                    chrome.tabs.update(tab.id, { active: true });
                    chrome.windows.update(tab.windowId, { focused: true });
                };
                card.appendChild(item);
            });
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
        // Set toggles based on preferences
        if (preferences) {
            sortPinned.checked = preferences.sorting.includes("pinned");
            sortRecency.checked = preferences.sorting.includes("recency");
            sortContext.checked = preferences.sorting.includes("context");
            sortUrl.checked = preferences.sorting.includes("url");
        }
        const windowTitles = new Map();
        chromeWindows.forEach(w => {
            if (w.id)
                windowTitles.set(w.id, `Win ${w.id}`);
        });
        windowState = mapWindows(state.data.groups, windowTitles);
        render();
    }
};
const getSorting = () => {
    const s = [];
    if (sortPinned.checked)
        s.push("pinned");
    if (sortRecency.checked)
        s.push("recency");
    if (sortContext.checked)
        s.push("context");
    if (sortUrl.checked)
        s.push("url");
    return s.length ? s : ["pinned", "recency"];
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
searchInput.oninput = render;
load();
