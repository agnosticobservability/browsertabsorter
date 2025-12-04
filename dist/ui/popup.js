const groupsContainer = document.getElementById("groups");
const refreshButton = document.getElementById("refresh");
const saveButton = document.getElementById("saveSession");
const sessionNameInput = document.getElementById("sessionName");
const filterInput = document.getElementById("filterInput");
const applyFilterButton = document.getElementById("applyFilter");
const sortSelect = document.getElementById("sortType");
let latestGroups = [];
let baseSorting = [];
const sortingLabels = {
    pinned: "Pinned before others",
    recency: "Most recent first",
    hierarchy: "Parents before children"
};
const populateSortOptions = (initial) => {
    sortSelect.innerHTML = "";
    Object.keys(sortingLabels).forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = sortingLabels[value];
        option.selected = value === initial;
        sortSelect.appendChild(option);
    });
};
const resolveSorting = () => {
    const fallback = baseSorting.length ? baseSorting : ["pinned", "recency"];
    const selection = sortSelect.value || fallback[0];
    const remaining = fallback.filter((strategy) => strategy !== selection);
    return [selection, ...remaining];
};
const sortTabs = (tabs, strategies) => {
    return [...tabs].sort((a, b) => {
        for (const strategy of strategies) {
            let diff = 0;
            switch (strategy) {
                case "recency":
                    diff = (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0);
                    break;
                case "hierarchy":
                    diff = (a.openerTabId !== undefined ? 1 : 0) - (b.openerTabId !== undefined ? 1 : 0);
                    break;
                case "pinned":
                    diff = (a.pinned ? 0 : 1) - (b.pinned ? 0 : 1);
                    break;
            }
            if (diff !== 0)
                return diff;
        }
        return a.id - b.id;
    });
};
const applySortingToGroups = (groups) => {
    const strategies = resolveSorting();
    return groups.map((group) => ({
        ...group,
        tabs: sortTabs(group.tabs, strategies)
    }));
};
const fetchState = async () => {
    const response = await chrome.runtime.sendMessage({ type: "getState" });
    return response;
};
const applyGrouping = async () => {
    const response = await chrome.runtime.sendMessage({ type: "applyGrouping" });
    return response;
};
const renderGroups = (groups) => {
    groupsContainer.innerHTML = "";
    const groupTemplate = document.getElementById("group-template");
    const tabTemplate = document.getElementById("tab-template");
    groups.forEach((group) => {
        const node = groupTemplate.content.cloneNode(true);
        const article = node.querySelector(".group");
        article.style.borderColor = `var(--${group.color}, #cbd5e1)`;
        const title = node.querySelector(".group-title");
        title.textContent = `${group.label} (${group.tabs.length})`;
        const reason = node.querySelector(".group-reason");
        reason.textContent = group.reason;
        const list = node.querySelector(".tab-list");
        group.tabs.forEach((tab) => {
            const tabNode = tabTemplate.content.cloneNode(true);
            const tabEl = tabNode.querySelector(".tab-item");
            const titleEl = tabNode.querySelector(".tab-title");
            const closeButton = tabNode.querySelector(".close-tab");
            titleEl.textContent = tab.title;
            tabEl.title = tab.url;
            closeButton.addEventListener("click", async () => {
                await chrome.tabs.remove(tab.id);
                const state = await fetchState();
                if (state.ok && state.data)
                    updateGroups(state.data.groups);
            });
            list.appendChild(tabNode);
        });
        groupsContainer.appendChild(node);
    });
};
const updateGroups = (groups) => {
    latestGroups = groups;
    renderGroups(groups);
};
const applyFilter = () => {
    const query = filterInput.value.trim().toLowerCase();
    if (!query) {
        renderGroups(applySortingToGroups(latestGroups));
        return;
    }
    const filteredGroups = latestGroups
        .map((group) => ({
        ...group,
        tabs: group.tabs.filter((tab) => {
            const title = tab.title.toLowerCase();
            const url = tab.url.toLowerCase();
            return title.includes(query) || url.includes(query);
        })
    }))
        .filter((group) => group.tabs.length > 0);
    renderGroups(applySortingToGroups(filteredGroups));
};
const onSaveSession = async () => {
    const name = sessionNameInput.value.trim() || `Session ${new Date().toLocaleString()}`;
    const state = await fetchState();
    if (!state.ok || !state.data)
        return;
    await chrome.runtime.sendMessage({ type: "saveSession", payload: { name, groups: state.data.groups } });
    sessionNameInput.value = "";
};
const initialize = async () => {
    const state = await fetchState();
    if (state.ok && state.data) {
        baseSorting = state.data.preferences.sorting.length
            ? state.data.preferences.sorting
            : ["pinned", "recency"];
        populateSortOptions(baseSorting[0]);
        updateGroups(state.data.groups);
    }
};
refreshButton.addEventListener("click", async () => {
    const state = await applyGrouping();
    if (state.ok && state.data)
        updateGroups(state.data.groups);
});
saveButton.addEventListener("click", onSaveSession);
applyFilterButton.addEventListener("click", applyFilter);
initialize();
export {};
