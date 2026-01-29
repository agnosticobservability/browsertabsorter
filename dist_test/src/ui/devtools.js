"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const contextAnalysis_js_1 = require("../background/contextAnalysis.js");
const groupingStrategies_js_1 = require("../background/groupingStrategies.js");
const generaRegistry_js_1 = require("../background/extraction/generaRegistry.js");
const sortingStrategies_js_1 = require("../background/sortingStrategies.js");
const groupingStrategies_js_2 = require("../background/groupingStrategies.js");
const strategyRegistry_js_1 = require("../shared/strategyRegistry.js");
// State
let currentTabs = [];
let localCustomStrategies = [];
let currentContextMap = new Map();
let tabTitles = new Map();
let sortKey = null;
let sortDirection = 'asc';
let simulatedSelection = new Set();
// Modern Table State
let globalSearchQuery = '';
let columnFilters = {};
let columns = [
    { key: 'id', label: 'ID', visible: true, width: '60px', filterable: true },
    { key: 'index', label: 'Index', visible: true, width: '60px', filterable: true },
    { key: 'windowId', label: 'Window', visible: true, width: '70px', filterable: true },
    { key: 'groupId', label: 'Group', visible: true, width: '70px', filterable: true },
    { key: 'title', label: 'Title', visible: true, width: '200px', filterable: true },
    { key: 'url', label: 'URL', visible: true, width: '250px', filterable: true },
    { key: 'status', label: 'Status', visible: false, width: '80px', filterable: true },
    { key: 'active', label: 'Active', visible: false, width: '60px', filterable: true },
    { key: 'pinned', label: 'Pinned', visible: false, width: '60px', filterable: true },
    { key: 'openerTabId', label: 'Opener', visible: false, width: '70px', filterable: true },
    { key: 'parentTitle', label: 'Parent Title', visible: false, width: '150px', filterable: true },
    { key: 'genre', label: 'Genre', visible: true, width: '100px', filterable: true },
    { key: 'context', label: 'Extracted Context', visible: true, width: '400px', filterable: true },
    { key: 'lastAccessed', label: 'Last Accessed', visible: true, width: '150px', filterable: false },
    { key: 'actions', label: 'Actions', visible: true, width: '120px', filterable: false }
];
document.addEventListener('DOMContentLoaded', async () => {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadTabs);
    }
    // Tab Switching Logic
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all buttons and sections
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
            // Add active class to clicked button
            btn.classList.add('active');
            // Show target section
            const targetId = btn.dataset.target;
            if (targetId) {
                document.getElementById(targetId)?.classList.add('active');
            }
            // If switching to algorithms, populate reference if empty
            if (targetId === 'view-algorithms') {
                renderAlgorithmsView();
            }
            else if (targetId === 'view-strategy-list') {
                renderStrategyListTable();
            }
        });
    });
    // Simulation Logic
    const runSimBtn = document.getElementById('runSimBtn');
    if (runSimBtn) {
        runSimBtn.addEventListener('click', runSimulation);
    }
    const applyBtn = document.getElementById('applyBtn');
    if (applyBtn) {
        applyBtn.addEventListener('click', applyToBrowser);
    }
    // Modern Table Controls
    const globalSearchInput = document.getElementById('globalSearch');
    if (globalSearchInput) {
        globalSearchInput.addEventListener('input', (e) => {
            globalSearchQuery = e.target.value;
            renderTable();
        });
    }
    const columnsBtn = document.getElementById('columnsBtn');
    if (columnsBtn) {
        columnsBtn.addEventListener('click', () => {
            const menu = document.getElementById('columnsMenu');
            menu?.classList.toggle('hidden');
            renderColumnsMenu();
        });
    }
    const resetViewBtn = document.getElementById('resetViewBtn');
    if (resetViewBtn) {
        resetViewBtn.addEventListener('click', () => {
            // Reset columns to defaults (simplified, just show all reasonable ones)
            columns.forEach(c => c.visible = ['id', 'title', 'url', 'windowId', 'groupId', 'genre', 'context', 'actions'].includes(c.key));
            globalSearchQuery = '';
            if (globalSearchInput)
                globalSearchInput.value = '';
            columnFilters = {};
            renderTableHeader();
            renderTable();
        });
    }
    // Hide column menu when clicking outside
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (!target.closest('.columns-menu-container')) {
            document.getElementById('columnsMenu')?.classList.add('hidden');
        }
    });
    // Listen for tab updates to refresh data (SPA support)
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        // We update if URL changes or status changes to complete
        if (changeInfo.url || changeInfo.status === 'complete') {
            loadTabs();
        }
    });
    // Listen for tab removals to refresh data
    chrome.tabs.onRemoved.addListener(() => {
        loadTabs();
    });
    document.addEventListener('click', (event) => {
        const target = event.target;
        if (!target)
            return;
        if (target.matches('.context-json-btn')) {
            const tabId = Number(target.dataset.tabId);
            if (!tabId)
                return;
            const data = currentContextMap.get(tabId)?.data;
            if (!data)
                return;
            const json = JSON.stringify(data, null, 2);
            const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>JSON View</title>
          <style>
            body { font-family: monospace; background-color: #f0f0f0; padding: 20px; }
            pre { background-color: white; padding: 15px; border-radius: 5px; border: 1px solid #ccc; overflow: auto; }
          </style>
        </head>
        <body>
          <h3>JSON Data</h3>
          <pre>${escapeHtml(json)}</pre>
        </body>
        </html>
      `;
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank', 'noopener,noreferrer');
        }
        else if (target.matches('.goto-tab-btn')) {
            const tabId = Number(target.dataset.tabId);
            const windowId = Number(target.dataset.windowId);
            if (tabId && windowId) {
                chrome.tabs.update(tabId, { active: true });
                chrome.windows.update(windowId, { focused: true });
            }
        }
        else if (target.matches('.close-tab-btn')) {
            const tabId = Number(target.dataset.tabId);
            if (tabId) {
                chrome.tabs.remove(tabId);
            }
        }
        else if (target.matches('.strategy-view-btn')) {
            const type = target.dataset.type;
            const name = target.dataset.name;
            if (type && name) {
                showStrategyDetails(type, name);
            }
        }
    });
    // Init table header
    renderTableHeader();
    loadTabs();
    // Pre-render static content
    await loadPreferencesAndInit(); // Load preferences first to init strategies
    renderAlgorithmsView();
    loadCustomGenera();
    initStrategyBuilder();
    const exportAllBtn = document.getElementById('strategy-list-export-btn');
    const importAllBtn = document.getElementById('strategy-list-import-btn');
    if (exportAllBtn)
        exportAllBtn.addEventListener('click', exportAllStrategies);
    if (importAllBtn)
        importAllBtn.addEventListener('click', importAllStrategies);
});
// Column Management
function renderColumnsMenu() {
    const menu = document.getElementById('columnsMenu');
    if (!menu)
        return;
    menu.innerHTML = columns.map(col => `
        <label class="column-toggle">
            <input type="checkbox" data-key="${col.key}" ${col.visible ? 'checked' : ''}>
            ${escapeHtml(col.label)}
        </label>
    `).join('');
    menu.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', (e) => {
            const key = e.target.dataset.key;
            const checked = e.target.checked;
            const col = columns.find(c => c.key === key);
            if (col) {
                col.visible = checked;
                renderTableHeader(); // Re-render header to add/remove columns
                renderTable(); // Re-render body
            }
        });
    });
}
function renderTableHeader() {
    const headerRow = document.getElementById('headerRow');
    const filterRow = document.getElementById('filterRow');
    if (!headerRow || !filterRow)
        return;
    const visibleCols = columns.filter(c => c.visible);
    // Render Headers
    headerRow.innerHTML = visibleCols.map(col => `
        <th class="${col.key !== 'actions' ? 'sortable' : ''}" data-key="${col.key}" style="width: ${col.width}; position: relative;">
            ${escapeHtml(col.label)}
            <div class="resizer"></div>
        </th>
    `).join('');
    // Render Filter Inputs
    filterRow.innerHTML = visibleCols.map(col => {
        if (!col.filterable)
            return '<th></th>';
        const val = columnFilters[col.key] || '';
        return `
            <th>
                <input type="text" class="filter-input" data-key="${col.key}" value="${escapeHtml(val)}" placeholder="Filter...">
            </th>
        `;
    }).join('');
    // Attach Sort Listeners
    headerRow.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', (e) => {
            // Ignore if clicked on resizer
            if (e.target.classList.contains('resizer'))
                return;
            const key = th.getAttribute('data-key');
            if (key)
                handleSort(key);
        });
    });
    // Attach Filter Listeners
    filterRow.querySelectorAll('.filter-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const key = e.target.dataset.key;
            const val = e.target.value;
            if (key) {
                columnFilters[key] = val;
                renderTable();
            }
        });
    });
    // Attach Resize Listeners
    headerRow.querySelectorAll('.resizer').forEach(resizer => {
        initResize(resizer);
    });
    updateHeaderStyles();
}
function initResize(resizer) {
    let x = 0;
    let w = 0;
    let th;
    const mouseDownHandler = (e) => {
        th = resizer.parentElement;
        x = e.clientX;
        w = th.offsetWidth;
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
        resizer.classList.add('resizing');
    };
    const mouseMoveHandler = (e) => {
        const dx = e.clientX - x;
        const colKey = th.getAttribute('data-key');
        const col = columns.find(c => c.key === colKey);
        if (col) {
            const newWidth = Math.max(30, w + dx); // Min width 30px
            col.width = `${newWidth}px`;
            th.style.width = col.width;
        }
    };
    const mouseUpHandler = () => {
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);
        resizer.classList.remove('resizing');
    };
    resizer.addEventListener('mousedown', mouseDownHandler);
}
async function loadPreferencesAndInit() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'loadPreferences' });
        if (response && response.ok && response.data) {
            const prefs = response.data;
            localCustomStrategies = prefs.customStrategies || [];
            (0, groupingStrategies_js_2.setCustomStrategies)(localCustomStrategies);
            renderStrategyLoadOptions();
            renderStrategyListTable();
        }
    }
    catch (e) {
        console.error("Failed to load preferences", e);
    }
}
async function loadCustomGenera() {
    const listContainer = document.getElementById('custom-genera-list');
    if (!listContainer)
        return;
    try {
        const response = await chrome.runtime.sendMessage({ type: 'loadPreferences' });
        if (response && response.ok && response.data) {
            const prefs = response.data;
            renderCustomGeneraList(prefs.customGenera || {});
        }
    }
    catch (e) {
        console.error("Failed to load custom genera", e);
    }
}
// ---------------------- STRATEGY BUILDER ----------------------
function getBuiltInStrategyConfig(id) {
    const base = {
        id: id,
        label: strategyRegistry_js_1.STRATEGIES.find(s => s.id === id)?.label || id,
        filters: [],
        groupingRules: [],
        sortingRules: [],
        groupSortingRules: [],
        fallback: 'Misc',
        sortGroups: false,
        autoRun: false
    };
    switch (id) {
        case 'domain':
            base.groupingRules = [{ source: 'field', value: 'domain', transform: 'stripTld', color: 'random' }];
            base.sortingRules = [{ field: 'domain', order: 'asc' }];
            break;
        case 'domain_full':
            base.groupingRules = [{ source: 'field', value: 'domain', transform: 'none', color: 'random' }];
            base.sortingRules = [{ field: 'domain', order: 'asc' }];
            break;
        case 'topic':
            base.groupingRules = [{ source: 'field', value: 'genre', color: 'random' }];
            break;
        case 'context':
            base.groupingRules = [{ source: 'field', value: 'context', color: 'random' }];
            break;
        case 'lineage':
            base.groupingRules = [{ source: 'field', value: 'parentTitle', color: 'random' }];
            break;
        case 'pinned':
            base.sortingRules = [{ field: 'pinned', order: 'desc' }];
            base.groupingRules = [{ source: 'field', value: 'pinned', color: 'random' }];
            break;
        case 'recency':
            base.sortingRules = [{ field: 'lastAccessed', order: 'desc' }];
            break;
        case 'age':
            base.sortingRules = [{ field: 'lastAccessed', order: 'desc' }];
            break;
        case 'url':
            base.sortingRules = [{ field: 'url', order: 'asc' }];
            break;
        case 'title':
            base.sortingRules = [{ field: 'title', order: 'asc' }];
            break;
        case 'nesting':
            base.sortingRules = [{ field: 'parentTitle', order: 'asc' }];
            break;
    }
    return base;
}
const FIELD_OPTIONS = `
                <optgroup label="Standard Fields">
                    <option value="url">URL</option>
                    <option value="title">Title</option>
                    <option value="domain">Domain</option>
                    <option value="subdomain">Subdomain</option>
                    <option value="id">ID</option>
                    <option value="index">Index</option>
                    <option value="windowId">Window ID</option>
                    <option value="groupId">Group ID</option>
                    <option value="active">Active</option>
                    <option value="selected">Selected</option>
                    <option value="pinned">Pinned</option>
                    <option value="status">Status</option>
                    <option value="openerTabId">Opener ID</option>
                    <option value="parentTitle">Parent Title</option>
                    <option value="lastAccessed">Last Accessed</option>
                    <option value="genre">Genre</option>
                    <option value="context">Context Summary</option>
                </optgroup>
                <optgroup label="Context Data (JSON)">
                    <option value="contextData.siteName">Site Name</option>
                    <option value="contextData.canonicalUrl">Canonical URL</option>
                    <option value="contextData.normalizedUrl">Normalized URL</option>
                    <option value="contextData.platform">Platform</option>
                    <option value="contextData.objectType">Object Type</option>
                    <option value="contextData.objectId">Object ID</option>
                    <option value="contextData.title">Extracted Title</option>
                    <option value="contextData.description">Description</option>
                    <option value="contextData.authorOrCreator">Author/Creator</option>
                    <option value="contextData.publishedAt">Published At</option>
                    <option value="contextData.modifiedAt">Modified At</option>
                    <option value="contextData.language">Language</option>
                    <option value="contextData.isAudible">Is Audible</option>
                    <option value="contextData.isMuted">Is Muted</option>
                    <option value="contextData.hasUnsavedChangesLikely">Unsaved Changes</option>
                    <option value="contextData.isAuthenticatedLikely">Authenticated</option>
                </optgroup>`;
const OPERATOR_OPTIONS = `
                <option value="contains">contains</option>
                <option value="doesNotContain">does not contain</option>
                <option value="matches">matches regex</option>
                <option value="equals">equals</option>
                <option value="startsWith">starts with</option>
                <option value="endsWith">ends with</option>
                <option value="exists">exists</option>
                <option value="doesNotExist">does not exist</option>
                <option value="isNull">is null</option>
                <option value="isNotNull">is not null</option>`;
function initStrategyBuilder() {
    const addFilterGroupBtn = document.getElementById('add-filter-group-btn');
    const addGroupBtn = document.getElementById('add-group-btn');
    const addSortBtn = document.getElementById('add-sort-btn');
    const loadSelect = document.getElementById('strategy-load-select');
    // New: Group Sorting
    const addGroupSortBtn = document.getElementById('add-group-sort-btn');
    const groupSortCheck = document.getElementById('strat-sortgroups-check');
    const saveBtn = document.getElementById('builder-save-btn');
    const runBtn = document.getElementById('builder-run-btn');
    const runLiveBtn = document.getElementById('builder-run-live-btn');
    const clearBtn = document.getElementById('builder-clear-btn');
    const exportBtn = document.getElementById('builder-export-btn');
    const importBtn = document.getElementById('builder-import-btn');
    if (exportBtn)
        exportBtn.addEventListener('click', exportBuilderStrategy);
    if (importBtn)
        importBtn.addEventListener('click', importBuilderStrategy);
    if (addFilterGroupBtn)
        addFilterGroupBtn.addEventListener('click', () => addFilterGroupRow());
    if (addGroupBtn)
        addGroupBtn.addEventListener('click', () => addBuilderRow('group'));
    if (addSortBtn)
        addSortBtn.addEventListener('click', () => addBuilderRow('sort'));
    if (addGroupSortBtn)
        addGroupSortBtn.addEventListener('click', () => addBuilderRow('groupSort'));
    if (groupSortCheck) {
        groupSortCheck.addEventListener('change', (e) => {
            const checked = e.target.checked;
            const container = document.getElementById('group-sort-rows-container');
            const addBtn = document.getElementById('add-group-sort-btn');
            if (container && addBtn) {
                container.style.display = checked ? 'block' : 'none';
                addBtn.style.display = checked ? 'block' : 'none';
            }
        });
    }
    if (saveBtn)
        saveBtn.addEventListener('click', () => saveCustomStrategyFromBuilder(true));
    if (runBtn)
        runBtn.addEventListener('click', runBuilderSimulation);
    if (runLiveBtn)
        runLiveBtn.addEventListener('click', runBuilderLive);
    if (clearBtn)
        clearBtn.addEventListener('click', clearBuilder);
    if (loadSelect) {
        loadSelect.addEventListener('change', () => {
            const selectedId = loadSelect.value;
            if (!selectedId)
                return;
            let strat = localCustomStrategies.find(s => s.id === selectedId);
            if (!strat) {
                strat = getBuiltInStrategyConfig(selectedId) || undefined;
            }
            if (strat) {
                populateBuilderFromStrategy(strat);
            }
        });
    }
    // Initial Live View
    renderLiveView();
    const refreshLiveBtn = document.getElementById('refresh-live-view-btn');
    if (refreshLiveBtn)
        refreshLiveBtn.addEventListener('click', renderLiveView);
    const liveContainer = document.getElementById('live-view-container');
    if (liveContainer) {
        liveContainer.addEventListener('click', (e) => {
            const target = e.target;
            const item = target.closest('.selectable-item');
            if (!item)
                return;
            const type = item.dataset.type;
            const id = Number(item.dataset.id);
            if (!type || isNaN(id))
                return;
            if (type === 'tab') {
                if (simulatedSelection.has(id))
                    simulatedSelection.delete(id);
                else
                    simulatedSelection.add(id);
            }
            else if (type === 'group') {
                // Toggle all tabs in group
                // We need to know which tabs are in the group.
                // We can find them in DOM or refetch. DOM is easier.
                // Or better, logic in renderLiveView handles rendering, here we handle data.
                // Let's rely on DOM structure or re-query.
                // Re-querying is robust.
                chrome.tabs.query({}).then(tabs => {
                    const groupTabs = tabs.filter(t => t.groupId === id);
                    const allSelected = groupTabs.every(t => t.id && simulatedSelection.has(t.id));
                    groupTabs.forEach(t => {
                        if (t.id) {
                            if (allSelected)
                                simulatedSelection.delete(t.id);
                            else
                                simulatedSelection.add(t.id);
                        }
                    });
                    renderLiveView();
                });
                return; // async update
            }
            else if (type === 'window') {
                chrome.tabs.query({}).then(tabs => {
                    const winTabs = tabs.filter(t => t.windowId === id);
                    const allSelected = winTabs.every(t => t.id && simulatedSelection.has(t.id));
                    winTabs.forEach(t => {
                        if (t.id) {
                            if (allSelected)
                                simulatedSelection.delete(t.id);
                            else
                                simulatedSelection.add(t.id);
                        }
                    });
                    renderLiveView();
                });
                return; // async update
            }
            renderLiveView();
        });
    }
}
function addFilterGroupRow(conditions) {
    const container = document.getElementById('filter-rows-container');
    if (!container)
        return;
    const groupDiv = document.createElement('div');
    groupDiv.className = 'filter-group-row';
    groupDiv.style.border = '1px solid #e0e0e0';
    groupDiv.style.borderRadius = '5px';
    groupDiv.style.padding = '10px';
    groupDiv.style.marginBottom = '10px';
    groupDiv.style.backgroundColor = '#fafafa';
    groupDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
            <span style="font-weight: bold; color: #555; font-size: 0.9em;">Group (AND)</span>
            <button class="small-btn btn-del-group" style="background: #ffcccc; color: darkred;">Delete Group</button>
        </div>
        <div class="conditions-container"></div>
        <button class="small-btn btn-add-condition" style="margin-top: 5px;">+ Add Condition</button>
    `;
    groupDiv.querySelector('.btn-del-group')?.addEventListener('click', () => {
        groupDiv.remove();
        updateBreadcrumb();
    });
    const conditionsContainer = groupDiv.querySelector('.conditions-container');
    const addConditionBtn = groupDiv.querySelector('.btn-add-condition');
    const addCondition = (data) => {
        const div = document.createElement('div');
        div.className = 'builder-row condition-row';
        div.style.display = 'flex';
        div.style.gap = '5px';
        div.style.marginBottom = '5px';
        div.style.alignItems = 'center';
        div.innerHTML = `
            <select class="field-select">
                ${FIELD_OPTIONS}
            </select>
            <span class="operator-container">
                <select class="operator-select">
                    ${OPERATOR_OPTIONS}
                </select>
            </span>
            <span class="value-container">
                <input type="text" class="value-input" placeholder="Value">
            </span>
            <button class="small-btn btn-del-condition" style="background: none; border: none; color: red;">&times;</button>
        `;
        const fieldSelect = div.querySelector('.field-select');
        const operatorContainer = div.querySelector('.operator-container');
        const valueContainer = div.querySelector('.value-container');
        const updateState = (initialOp, initialVal) => {
            const val = fieldSelect.value;
            // Handle boolean fields
            if (['selected', 'pinned'].includes(val)) {
                operatorContainer.innerHTML = `<select class="operator-select" disabled style="background: #eee; color: #555;"><option value="equals">is</option></select>`;
                valueContainer.innerHTML = `
                    <select class="value-input">
                        <option value="true">True</option>
                        <option value="false">False</option>
                    </select>
                `;
            }
            else {
                // Check if already in standard mode to avoid unnecessary DOM thrashing
                if (!operatorContainer.querySelector('select:not([disabled])')) {
                    operatorContainer.innerHTML = `<select class="operator-select">${OPERATOR_OPTIONS}</select>`;
                    valueContainer.innerHTML = `<input type="text" class="value-input" placeholder="Value">`;
                }
            }
            // Restore values if provided (especially when switching back or initializing)
            if (initialOp || initialVal) {
                const opEl = div.querySelector('.operator-select');
                const valEl = div.querySelector('.value-input');
                if (opEl && initialOp)
                    opEl.value = initialOp;
                if (valEl && initialVal)
                    valEl.value = initialVal;
            }
            // Re-attach listeners to new elements
            div.querySelectorAll('input, select').forEach(el => {
                el.removeEventListener('change', updateBreadcrumb);
                el.removeEventListener('input', updateBreadcrumb);
                el.addEventListener('change', updateBreadcrumb);
                el.addEventListener('input', updateBreadcrumb);
            });
        };
        fieldSelect.addEventListener('change', () => {
            updateState();
            updateBreadcrumb();
        });
        if (data) {
            fieldSelect.value = data.field;
            updateState(data.operator, data.value);
        }
        else {
            updateState();
        }
        div.querySelector('.btn-del-condition')?.addEventListener('click', () => {
            div.remove();
            updateBreadcrumb();
        });
        conditionsContainer.appendChild(div);
    };
    addConditionBtn?.addEventListener('click', () => addCondition());
    if (conditions && conditions.length > 0) {
        conditions.forEach(c => addCondition(c));
    }
    else {
        // Add one empty condition by default
        addCondition();
    }
    container.appendChild(groupDiv);
    updateBreadcrumb();
}
function addBuilderRow(type, data) {
    let containerId = '';
    if (type === 'group')
        containerId = 'group-rows-container';
    else if (type === 'sort')
        containerId = 'sort-rows-container';
    else if (type === 'groupSort')
        containerId = 'group-sort-rows-container';
    const container = document.getElementById(containerId);
    if (!container)
        return;
    const div = document.createElement('div');
    div.className = 'builder-row';
    div.dataset.type = type;
    if (type === 'group') {
        div.style.flexWrap = 'wrap';
        div.innerHTML = `
            <span class="row-number"></span>
            <select class="source-select">
                <option value="field">Field</option>
                <option value="fixed">Fixed Value</option>
            </select>

            <span class="input-container">
                 <!-- Will be populated based on source selection -->
                 <select class="field-select value-input-field">
                    ${FIELD_OPTIONS}
                 </select>
                 <input type="text" class="value-input-text" placeholder="Group Name" style="display:none;">
            </span>

            <span style="margin-left: 10px;">Transform:</span>
            <select class="transform-select">
                <option value="none">None</option>
                <option value="stripTld">Strip TLD</option>
                <option value="domain">Get Domain</option>
                <option value="hostname">Get Hostname</option>
                <option value="lowercase">Lowercase</option>
                <option value="uppercase">Uppercase</option>
                <option value="firstChar">First Char</option>
                <option value="regex">Regex Extraction</option>
            </select>

            <div class="regex-container" style="display:none; flex-basis: 100%; margin-top: 8px; padding: 8px; background: #f8f9fa; border: 1px dashed #ced4da; border-radius: 4px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                    <span style="font-weight: 500; font-size: 0.9em;">Pattern:</span>
                    <input type="text" class="transform-pattern" placeholder="e.g. ^(\w+)-(\d+)$" style="flex:1;">
                    <span title="Captures all groups and concatenates them. If no match, result is empty. Example: 'user-(\d+)' extracts '123' from 'user-123'." style="cursor: help; color: #007bff; font-weight: bold; background: #e7f1ff; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 12px;">?</span>
                </div>
                <div style="display: flex; gap: 8px; align-items: center; font-size: 0.9em;">
                    <span style="font-weight: 500;">Test:</span>
                    <input type="text" class="regex-test-input" placeholder="Test String" style="flex: 1;">
                    <span>&rarr;</span>
                    <span class="regex-test-result" style="font-family: monospace; background: white; padding: 2px 5px; border: 1px solid #ddd; border-radius: 3px; min-width: 60px;">(preview)</span>
                </div>
            </div>

            <span style="margin-left: 10px;">Window:</span>
            <select class="window-mode-select">
                <option value="current">Current</option>
                <option value="compound">Compound</option>
                <option value="new">New</option>
            </select>

            <span style="margin-left: 10px;">Color:</span>
            <select class="color-input">
                <option value="grey">Grey</option>
                <option value="blue">Blue</option>
                <option value="red">Red</option>
                <option value="yellow">Yellow</option>
                <option value="green">Green</option>
                <option value="pink">Pink</option>
                <option value="purple">Purple</option>
                <option value="cyan">Cyan</option>
                <option value="orange">Orange</option>
            </select>
            <label><input type="checkbox" class="random-color-check" checked> Random</label>

            <div class="row-actions">
                <button class="small-btn btn-del" style="background: #ffcccc; color: darkred;">Delete</button>
            </div>
        `;
        // Add specific listeners for Group row
        const sourceSelect = div.querySelector('.source-select');
        const fieldSelect = div.querySelector('.value-input-field');
        const textInput = div.querySelector('.value-input-text');
        const colorInput = div.querySelector('.color-input');
        const randomCheck = div.querySelector('.random-color-check');
        // Regex Logic
        const transformSelect = div.querySelector('.transform-select');
        const regexContainer = div.querySelector('.regex-container');
        const patternInput = div.querySelector('.transform-pattern');
        const testInput = div.querySelector('.regex-test-input');
        const testResult = div.querySelector('.regex-test-result');
        const toggleTransform = () => {
            if (transformSelect.value === 'regex') {
                regexContainer.style.display = 'block';
            }
            else {
                regexContainer.style.display = 'none';
            }
            updateBreadcrumb();
        };
        transformSelect.addEventListener('change', toggleTransform);
        const updateTest = () => {
            const pat = patternInput.value;
            const txt = testInput.value;
            if (!pat || !txt) {
                testResult.textContent = "(preview)";
                testResult.style.color = "#555";
                return;
            }
            try {
                const regex = new RegExp(pat);
                const match = regex.exec(txt);
                if (match) {
                    let extracted = "";
                    for (let i = 1; i < match.length; i++) {
                        extracted += match[i] || "";
                    }
                    testResult.textContent = extracted || "(empty group)";
                    testResult.style.color = "green";
                }
                else {
                    testResult.textContent = "(no match)";
                    testResult.style.color = "red";
                }
            }
            catch (e) {
                testResult.textContent = "(invalid regex)";
                testResult.style.color = "red";
            }
        };
        patternInput.addEventListener('input', () => { updateTest(); updateBreadcrumb(); });
        testInput.addEventListener('input', updateTest);
        // Toggle input type
        const toggleInput = () => {
            if (sourceSelect.value === 'field') {
                fieldSelect.style.display = 'inline-block';
                textInput.style.display = 'none';
            }
            else {
                fieldSelect.style.display = 'none';
                textInput.style.display = 'inline-block';
            }
            updateBreadcrumb();
        };
        sourceSelect.addEventListener('change', toggleInput);
        // Toggle color input
        const toggleColor = () => {
            if (randomCheck.checked) {
                colorInput.disabled = true;
                colorInput.style.opacity = '0.5';
            }
            else {
                colorInput.disabled = false;
                colorInput.style.opacity = '1';
            }
        };
        randomCheck.addEventListener('change', toggleColor);
        toggleColor(); // init
    }
    else if (type === 'sort' || type === 'groupSort') {
        div.innerHTML = `
            <select class="field-select">
                ${FIELD_OPTIONS}
            </select>
            <select class="order-select">
                <option value="asc">a to z (asc)</option>
                <option value="desc">z to a (desc)</option>
            </select>
            <div class="row-actions">
                 <button class="small-btn btn-del" style="background: #ffcccc; color: darkred;">Delete</button>
            </div>
        `;
    }
    // Populate data if provided (for editing)
    if (data) {
        if (type === 'group') {
            const sourceSelect = div.querySelector('.source-select');
            const fieldSelect = div.querySelector('.value-input-field');
            const textInput = div.querySelector('.value-input-text');
            const transformSelect = div.querySelector('.transform-select');
            const colorInput = div.querySelector('.color-input');
            const randomCheck = div.querySelector('.random-color-check');
            const windowModeSelect = div.querySelector('.window-mode-select');
            if (data.source)
                sourceSelect.value = data.source;
            // Trigger toggle to show correct input
            sourceSelect.dispatchEvent(new Event('change'));
            if (data.source === 'field') {
                if (data.value)
                    fieldSelect.value = data.value;
            }
            else {
                if (data.value)
                    textInput.value = data.value;
            }
            if (data.transform)
                transformSelect.value = data.transform;
            if (data.transformPattern)
                div.querySelector('.transform-pattern').value = data.transformPattern;
            // Trigger toggle for regex UI
            transformSelect.dispatchEvent(new Event('change'));
            if (data.windowMode)
                windowModeSelect.value = data.windowMode;
            if (data.color && data.color !== 'random') {
                randomCheck.checked = false;
                colorInput.value = data.color;
            }
            else {
                randomCheck.checked = true;
            }
            // Trigger toggle color
            randomCheck.dispatchEvent(new Event('change'));
        }
        else if (type === 'sort' || type === 'groupSort') {
            if (data.field)
                div.querySelector('.field-select').value = data.field;
            if (data.order)
                div.querySelector('.order-select').value = data.order;
        }
    }
    // Listeners (General)
    div.querySelector('.btn-del')?.addEventListener('click', () => {
        div.remove();
        updateBreadcrumb();
    });
    // AND / OR listeners (Visual mainly, or appending new rows)
    div.querySelector('.btn-and')?.addEventListener('click', () => {
        addBuilderRow(type); // Just add another row
    });
    div.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('change', updateBreadcrumb);
        el.addEventListener('input', updateBreadcrumb);
    });
    container.appendChild(div);
    updateBreadcrumb();
}
function clearBuilder() {
    document.getElementById('strat-name').value = '';
    document.getElementById('strat-desc').value = '';
    document.getElementById('strat-autorun').checked = false;
    document.getElementById('strat-separate-window').checked = false;
    const sortGroupsCheck = document.getElementById('strat-sortgroups-check');
    if (sortGroupsCheck) {
        sortGroupsCheck.checked = false;
        // Trigger change to hide container
        sortGroupsCheck.dispatchEvent(new Event('change'));
    }
    const loadSelect = document.getElementById('strategy-load-select');
    if (loadSelect)
        loadSelect.value = '';
    ['filter-rows-container', 'group-rows-container', 'sort-rows-container', 'group-sort-rows-container'].forEach(id => {
        const el = document.getElementById(id);
        if (el)
            el.innerHTML = '';
    });
    const builderResults = document.getElementById('builder-results');
    if (builderResults)
        builderResults.innerHTML = '';
    addFilterGroupRow(); // Reset with one empty filter group
    updateBreadcrumb();
}
function exportBuilderStrategy() {
    const strat = getBuilderStrategy();
    if (!strat) {
        alert("Please define a strategy to export (ID and Label required).");
        return;
    }
    const json = JSON.stringify(strat, null, 2);
    const content = `
        <p>Copy the JSON below:</p>
        <textarea style="width: 100%; height: 300px; font-family: monospace;">${escapeHtml(json)}</textarea>
    `;
    showModal("Export Strategy", content);
}
function importBuilderStrategy() {
    const content = document.createElement('div');
    content.innerHTML = `
        <p>Paste Strategy JSON below:</p>
        <textarea id="import-strat-area" style="width: 100%; height: 200px; font-family: monospace; margin-bottom: 10px;"></textarea>
        <button id="import-strat-confirm" class="success-btn">Load</button>
    `;
    const btn = content.querySelector('#import-strat-confirm');
    btn?.addEventListener('click', () => {
        const txt = content.querySelector('#import-strat-area').value;
        try {
            const json = JSON.parse(txt);
            if (!json.id || !json.label) {
                alert("Invalid strategy: ID and Label are required.");
                return;
            }
            populateBuilderFromStrategy(json);
            document.querySelector('.modal-overlay')?.remove();
        }
        catch (e) {
            alert("Invalid JSON: " + e);
        }
    });
    showModal("Import Strategy", content);
}
function exportAllStrategies() {
    const json = JSON.stringify(localCustomStrategies, null, 2);
    const content = `
        <p>Copy the JSON below (contains ${localCustomStrategies.length} strategies):</p>
        <textarea style="width: 100%; height: 300px; font-family: monospace;">${escapeHtml(json)}</textarea>
    `;
    showModal("Export All Strategies", content);
}
function importAllStrategies() {
    const content = document.createElement('div');
    content.innerHTML = `
        <p>Paste Strategy List JSON below:</p>
        <p style="font-size: 0.9em; color: #666;">Note: Strategies with matching IDs will be overwritten.</p>
        <textarea id="import-all-area" style="width: 100%; height: 200px; font-family: monospace; margin-bottom: 10px;"></textarea>
        <button id="import-all-confirm" class="success-btn">Import All</button>
    `;
    const btn = content.querySelector('#import-all-confirm');
    btn?.addEventListener('click', async () => {
        const txt = content.querySelector('#import-all-area').value;
        try {
            const json = JSON.parse(txt);
            if (!Array.isArray(json)) {
                alert("Invalid format: Expected an array of strategies.");
                return;
            }
            // Validate items
            const invalid = json.find(s => !s.id || !s.label);
            if (invalid) {
                alert("Invalid strategy in list: missing ID or Label.");
                return;
            }
            // Merge logic (Upsert)
            const stratMap = new Map(localCustomStrategies.map(s => [s.id, s]));
            let count = 0;
            json.forEach((s) => {
                stratMap.set(s.id, s);
                count++;
            });
            const newStrategies = Array.from(stratMap.values());
            // Save
            await chrome.runtime.sendMessage({
                type: 'savePreferences',
                payload: { customStrategies: newStrategies }
            });
            // Update local state
            localCustomStrategies = newStrategies;
            (0, groupingStrategies_js_2.setCustomStrategies)(localCustomStrategies);
            renderStrategyLoadOptions();
            renderStrategyListTable();
            renderAlgorithmsView();
            alert(`Imported ${count} strategies.`);
            document.querySelector('.modal-overlay')?.remove();
        }
        catch (e) {
            alert("Invalid JSON: " + e);
        }
    });
    showModal("Import All Strategies", content);
}
function updateBreadcrumb() {
    const breadcrumb = document.getElementById('strategy-breadcrumb');
    if (!breadcrumb)
        return;
    let text = 'All';
    // Filters
    const filters = document.getElementById('filter-rows-container')?.querySelectorAll('.builder-row');
    if (filters && filters.length > 0) {
        filters.forEach(row => {
            const field = row.querySelector('.field-select').value;
            const op = row.querySelector('.operator-select').value;
            const val = row.querySelector('.value-input').value;
            if (val)
                text += ` > ${field} ${op} ${val}`;
        });
    }
    // Groups
    const groups = document.getElementById('group-rows-container')?.querySelectorAll('.builder-row');
    if (groups && groups.length > 0) {
        groups.forEach(row => {
            const source = row.querySelector('.source-select').value;
            let val = "";
            if (source === 'field') {
                val = row.querySelector('.value-input-field').value;
                text += ` > Group by Field: ${val}`;
            }
            else {
                val = row.querySelector('.value-input-text').value;
                text += ` > Group by Name: "${val}"`;
            }
        });
    }
    // Group Sorts
    const groupSorts = document.getElementById('group-sort-rows-container')?.querySelectorAll('.builder-row');
    if (groupSorts && groupSorts.length > 0) {
        groupSorts.forEach(row => {
            const field = row.querySelector('.field-select').value;
            const order = row.querySelector('.order-select').value;
            text += ` > Group sort by ${field} (${order})`;
        });
    }
    // Sorts
    const sorts = document.getElementById('sort-rows-container')?.querySelectorAll('.builder-row');
    if (sorts && sorts.length > 0) {
        sorts.forEach(row => {
            const field = row.querySelector('.field-select').value;
            const order = row.querySelector('.order-select').value;
            text += ` > Sort by ${field} (${order})`;
        });
    }
    breadcrumb.textContent = text;
}
function getBuilderStrategy(ignoreValidation = false) {
    const idInput = document.getElementById('strat-name');
    const labelInput = document.getElementById('strat-desc');
    let id = idInput ? idInput.value.trim() : '';
    let label = labelInput ? labelInput.value.trim() : '';
    const fallback = 'Misc'; // Fallback removed from UI, default to Misc
    const sortGroups = document.getElementById('strat-sortgroups-check').checked;
    if (!ignoreValidation && (!id || !label)) {
        return null;
    }
    if (ignoreValidation) {
        if (!id)
            id = 'temp_sim_id';
        if (!label)
            label = 'Simulation';
    }
    const filterGroups = [];
    const filterContainer = document.getElementById('filter-rows-container');
    // Parse filter groups
    if (filterContainer) {
        const groupRows = filterContainer.querySelectorAll('.filter-group-row');
        if (groupRows.length > 0) {
            groupRows.forEach(groupRow => {
                const conditions = [];
                groupRow.querySelectorAll('.builder-row').forEach(row => {
                    const field = row.querySelector('.field-select').value;
                    const operator = row.querySelector('.operator-select').value;
                    const value = row.querySelector('.value-input').value;
                    // Only add if value is present or operator doesn't require it
                    if (value || ['exists', 'doesNotExist', 'isNull', 'isNotNull'].includes(operator)) {
                        conditions.push({ field, operator, value });
                    }
                });
                if (conditions.length > 0) {
                    filterGroups.push(conditions);
                }
            });
        }
    }
    // For backward compatibility / simple strategies, populate filters with the first group
    const filters = filterGroups.length > 0 ? filterGroups[0] : [];
    const groupingRules = [];
    document.getElementById('group-rows-container')?.querySelectorAll('.builder-row').forEach(row => {
        const source = row.querySelector('.source-select').value;
        let value = "";
        if (source === 'field') {
            value = row.querySelector('.value-input-field').value;
        }
        else {
            value = row.querySelector('.value-input-text').value;
        }
        const transform = row.querySelector('.transform-select').value;
        const transformPattern = row.querySelector('.transform-pattern').value;
        const windowMode = row.querySelector('.window-mode-select').value;
        const randomCheck = row.querySelector('.random-color-check');
        const colorInput = row.querySelector('.color-input');
        let color = 'random';
        if (!randomCheck.checked) {
            color = colorInput.value;
        }
        if (value) {
            groupingRules.push({ source, value, color, transform, transformPattern: transform === 'regex' ? transformPattern : undefined, windowMode });
        }
    });
    const sortingRules = [];
    document.getElementById('sort-rows-container')?.querySelectorAll('.builder-row').forEach(row => {
        const field = row.querySelector('.field-select').value;
        const order = row.querySelector('.order-select').value;
        sortingRules.push({ field, order });
    });
    const groupSortingRules = [];
    document.getElementById('group-sort-rows-container')?.querySelectorAll('.builder-row').forEach(row => {
        const field = row.querySelector('.field-select').value;
        const order = row.querySelector('.order-select').value;
        groupSortingRules.push({ field, order });
    });
    const appliedGroupSortingRules = sortGroups ? groupSortingRules : [];
    return {
        id,
        label,
        filters,
        filterGroups,
        groupingRules,
        sortingRules,
        groupSortingRules: appliedGroupSortingRules,
        fallback,
        sortGroups
    };
}
function runBuilderSimulation() {
    // Pass true to ignore validation so we can simulate without ID/Label
    const strat = getBuilderStrategy(true);
    const resultContainer = document.getElementById('builder-results');
    const newStatePanel = document.getElementById('new-state-panel');
    if (!strat)
        return; // Should not happen with ignoreValidation=true
    // For simulation, we can mock an ID/Label if missing
    const simStrat = strat;
    if (!resultContainer || !newStatePanel)
        return;
    // Show the panel
    newStatePanel.style.display = 'flex';
    // Update localCustomStrategies temporarily for Sim
    const originalStrategies = [...localCustomStrategies];
    // Replace or add
    const existingIdx = localCustomStrategies.findIndex(s => s.id === simStrat.id);
    if (existingIdx !== -1) {
        localCustomStrategies[existingIdx] = simStrat;
    }
    else {
        localCustomStrategies.push(simStrat);
    }
    (0, groupingStrategies_js_2.setCustomStrategies)(localCustomStrategies);
    // Run Logic
    let tabs = getMappedTabs();
    if (tabs.length === 0) {
        resultContainer.innerHTML = '<p>No tabs found to simulate.</p>';
        // Restore strategies immediately
        localCustomStrategies = originalStrategies;
        (0, groupingStrategies_js_2.setCustomStrategies)(localCustomStrategies);
        return;
    }
    // Apply Simulated Selection Override
    if (simulatedSelection.size > 0) {
        tabs = tabs.map(t => ({
            ...t,
            selected: simulatedSelection.has(t.id)
        }));
    }
    // Sort using this strategy?
    // sortTabs expects SortingStrategy[].
    // If we use this strategy for sorting...
    tabs = (0, sortingStrategies_js_1.sortTabs)(tabs, [simStrat.id]);
    // Group using this strategy
    const groups = (0, groupingStrategies_js_1.groupTabs)(tabs, [simStrat.id]);
    // Check if we should show a fallback result (e.g. Sort Only)
    // If no groups were created, but we have tabs, and the strategy is not a grouping strategy,
    // we show the tabs as a single list.
    if (groups.length === 0) {
        const stratDef = (0, strategyRegistry_js_1.getStrategies)(localCustomStrategies).find(s => s.id === simStrat.id);
        if (stratDef && !stratDef.isGrouping) {
            groups.push({
                id: 'sim-sorted',
                windowId: 0,
                label: 'Sorted Results (No Grouping)',
                color: 'grey',
                tabs: tabs,
                reason: 'Sort Only'
            });
        }
    }
    // Restore strategies
    localCustomStrategies = originalStrategies;
    (0, groupingStrategies_js_2.setCustomStrategies)(localCustomStrategies);
    // Render Results
    if (groups.length === 0) {
        resultContainer.innerHTML = '<p>No groups created.</p>';
        return;
    }
    resultContainer.innerHTML = groups.map(group => `
    <div class="group-result" style="margin-bottom: 10px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden;">
      <div class="group-header" style="border-left: 5px solid ${group.color}; padding: 5px; background: #f8f9fa; font-size: 0.9em; font-weight: bold; display: flex; justify-content: space-between;">
        <span>${escapeHtml(group.label || 'Ungrouped')}</span>
        <span class="group-meta" style="font-weight: normal; font-size: 0.8em; color: #666;">${group.tabs.length}</span>
      </div>
      <ul class="group-tabs" style="list-style: none; margin: 0; padding: 0;">
        ${group.tabs.map(tab => `
          <li class="group-tab-item" style="padding: 4px 5px; border-top: 1px solid #eee; display: flex; gap: 5px; align-items: center; font-size: 0.85em;">
            <div style="width: 12px; height: 12px; background: #eee; border-radius: 2px; flex-shrink: 0;">
                ${tab.favIconUrl ? `<img src="${tab.favIconUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'">` : ''}
            </div>
            <span class="title-cell" title="${escapeHtml(tab.title)}" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(tab.title)}</span>
          </li>
        `).join('')}
      </ul>
    </div>
  `).join('');
}
async function saveCustomStrategyFromBuilder(showSuccess = true) {
    const strat = getBuilderStrategy();
    if (!strat) {
        alert("Please fill in ID and Label.");
        return false;
    }
    return saveStrategy(strat, showSuccess);
}
async function saveStrategy(strat, showSuccess) {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'loadPreferences' });
        if (response && response.ok && response.data) {
            const prefs = response.data;
            let currentStrategies = prefs.customStrategies || [];
            // Find existing to preserve props (like autoRun)
            const existing = currentStrategies.find(s => s.id === strat.id);
            if (existing) {
                strat.autoRun = existing.autoRun;
            }
            // Remove existing if same ID
            currentStrategies = currentStrategies.filter(s => s.id !== strat.id);
            currentStrategies.push(strat);
            await chrome.runtime.sendMessage({
                type: 'savePreferences',
                payload: { customStrategies: currentStrategies }
            });
            localCustomStrategies = currentStrategies;
            (0, groupingStrategies_js_2.setCustomStrategies)(localCustomStrategies);
            renderStrategyLoadOptions();
            renderStrategyListTable();
            renderAlgorithmsView();
            if (showSuccess)
                alert("Strategy saved!");
            return true;
        }
        return false;
    }
    catch (e) {
        console.error("Failed to save strategy", e);
        alert("Error saving strategy");
        return false;
    }
}
async function runBuilderLive() {
    const strat = getBuilderStrategy();
    if (!strat) {
        alert("Please fill in ID and Label to run live.");
        return;
    }
    // Save silently first to ensure backend has the definition
    const saved = await saveStrategy(strat, false);
    if (!saved)
        return;
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'applyGrouping',
            payload: {
                sorting: [strat.id]
            }
        });
        if (response && response.ok) {
            alert("Applied successfully!");
            loadTabs();
        }
        else {
            alert("Failed to apply: " + (response.error || 'Unknown error'));
        }
    }
    catch (e) {
        console.error("Apply failed", e);
        alert("Apply failed: " + e);
    }
}
function populateBuilderFromStrategy(strat) {
    document.getElementById('strat-name').value = strat.id;
    document.getElementById('strat-desc').value = strat.label;
    const sortGroupsCheck = document.getElementById('strat-sortgroups-check');
    const hasGroupSort = !!(strat.groupSortingRules && strat.groupSortingRules.length > 0) || !!strat.sortGroups;
    sortGroupsCheck.checked = hasGroupSort;
    sortGroupsCheck.dispatchEvent(new Event('change'));
    const autoRunCheck = document.getElementById('strat-autorun');
    autoRunCheck.checked = !!strat.autoRun;
    ['filter-rows-container', 'group-rows-container', 'sort-rows-container', 'group-sort-rows-container'].forEach(id => {
        const el = document.getElementById(id);
        if (el)
            el.innerHTML = '';
    });
    if (strat.filterGroups && strat.filterGroups.length > 0) {
        strat.filterGroups.forEach(g => addFilterGroupRow(g));
    }
    else if (strat.filters && strat.filters.length > 0) {
        addFilterGroupRow(strat.filters);
    }
    strat.groupingRules?.forEach(g => addBuilderRow('group', g));
    strat.sortingRules?.forEach(s => addBuilderRow('sort', s));
    strat.groupSortingRules?.forEach(gs => addBuilderRow('groupSort', gs));
    document.querySelector('#view-strategies')?.scrollIntoView({ behavior: 'smooth' });
    updateBreadcrumb();
}
function renderStrategyLoadOptions() {
    const select = document.getElementById('strategy-load-select');
    if (!select)
        return;
    const customOptions = localCustomStrategies
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label))
        .map(strategy => `
            <option value="${escapeHtml(strategy.id)}">${escapeHtml(strategy.label)} (${escapeHtml(strategy.id)})</option>
        `).join('');
    const builtInOptions = strategyRegistry_js_1.STRATEGIES
        .filter(s => !localCustomStrategies.some(cs => cs.id === s.id))
        .map(strategy => `
            <option value="${escapeHtml(strategy.id)}">${escapeHtml(strategy.label)} (Built-in)</option>
        `).join('');
    select.innerHTML = `<option value="">Load saved strategy...</option>` +
        (customOptions ? `<optgroup label="Custom Strategies">${customOptions}</optgroup>` : '') +
        (builtInOptions ? `<optgroup label="Built-in Strategies">${builtInOptions}</optgroup>` : '');
}
function renderStrategyListTable() {
    const tableBody = document.getElementById('strategy-table-body');
    if (!tableBody)
        return;
    const customIds = new Set(localCustomStrategies.map(strategy => strategy.id));
    const builtInRows = strategyRegistry_js_1.STRATEGIES.map(strategy => ({
        ...strategy,
        sourceLabel: 'Built-in',
        configSummary: '—',
        autoRunLabel: '—',
        actions: ''
    }));
    const customRows = localCustomStrategies.map(strategy => {
        const overridesBuiltIn = customIds.has(strategy.id) && strategyRegistry_js_1.STRATEGIES.some(builtIn => builtIn.id === strategy.id);
        return {
            id: strategy.id,
            label: strategy.label,
            isGrouping: true,
            isSorting: true,
            sourceLabel: overridesBuiltIn ? 'Custom (overrides built-in)' : 'Custom',
            configSummary: `Filters: ${strategy.filters?.length || 0}, Groups: ${strategy.groupingRules?.length || 0}, Sorts: ${strategy.sortingRules?.length || 0}`,
            autoRunLabel: strategy.autoRun ? 'Yes' : 'No',
            actions: `<button class="delete-strategy-row" data-id="${escapeHtml(strategy.id)}" style="color: red;">Delete</button>`
        };
    });
    const allRows = [...builtInRows, ...customRows];
    if (allRows.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="color: #888;">No strategies found.</td></tr>';
        return;
    }
    tableBody.innerHTML = allRows.map(row => {
        const capabilities = [row.isGrouping ? 'Grouping' : null, row.isSorting ? 'Sorting' : null].filter(Boolean).join(', ');
        return `
        <tr>
            <td>${escapeHtml(row.label)}</td>
            <td>${escapeHtml(String(row.id))}</td>
            <td>${escapeHtml(row.sourceLabel)}</td>
            <td>${escapeHtml(capabilities)}</td>
            <td>${escapeHtml(row.configSummary)}</td>
            <td>${escapeHtml(row.autoRunLabel)}</td>
            <td>${row.actions}</td>
        </tr>
        `;
    }).join('');
    tableBody.querySelectorAll('.delete-strategy-row').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            if (id && confirm(`Delete strategy "${id}"?`)) {
                await deleteCustomStrategy(id);
            }
        });
    });
}
async function deleteCustomStrategy(id) {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'loadPreferences' });
        if (response && response.ok && response.data) {
            const prefs = response.data;
            const newStrategies = (prefs.customStrategies || []).filter(s => s.id !== id);
            await chrome.runtime.sendMessage({
                type: 'savePreferences',
                payload: { customStrategies: newStrategies }
            });
            localCustomStrategies = newStrategies;
            (0, groupingStrategies_js_2.setCustomStrategies)(localCustomStrategies);
            renderStrategyLoadOptions();
            renderStrategyListTable();
            renderAlgorithmsView();
        }
    }
    catch (e) {
        console.error("Failed to delete strategy", e);
    }
}
// ... Genera management ... (kept as is)
function renderCustomGeneraList(customGenera) {
    const listContainer = document.getElementById('custom-genera-list');
    if (!listContainer)
        return;
    if (Object.keys(customGenera).length === 0) {
        listContainer.innerHTML = '<p style="color: #888; font-style: italic;">No custom entries.</p>';
        return;
    }
    listContainer.innerHTML = Object.entries(customGenera).map(([domain, category]) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px; border-bottom: 1px solid #f0f0f0;">
            <span><b>${escapeHtml(domain)}</b>: ${escapeHtml(category)}</span>
            <button class="delete-genera-btn" data-domain="${escapeHtml(domain)}" style="background: none; border: none; color: red; cursor: pointer;">&times;</button>
        </div>
    `).join('');
    // Re-attach listeners for delete buttons
    listContainer.querySelectorAll('.delete-genera-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const domain = e.target.dataset.domain;
            if (domain) {
                await deleteCustomGenera(domain);
            }
        });
    });
}
async function addCustomGenera() {
    const domainInput = document.getElementById('new-genera-domain');
    const categoryInput = document.getElementById('new-genera-category');
    if (!domainInput || !categoryInput)
        return;
    const domain = domainInput.value.trim().toLowerCase();
    const category = categoryInput.value.trim();
    if (!domain || !category) {
        alert("Please enter both domain and category.");
        return;
    }
    try {
        // Fetch current to merge
        const response = await chrome.runtime.sendMessage({ type: 'loadPreferences' });
        if (response && response.ok && response.data) {
            const prefs = response.data;
            const newCustomGenera = { ...(prefs.customGenera || {}), [domain]: category };
            await chrome.runtime.sendMessage({
                type: 'savePreferences',
                payload: { customGenera: newCustomGenera }
            });
            domainInput.value = '';
            categoryInput.value = '';
            loadCustomGenera();
            loadTabs(); // Refresh tabs to apply new classification if relevant
        }
    }
    catch (e) {
        console.error("Failed to add custom genera", e);
    }
}
async function deleteCustomGenera(domain) {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'loadPreferences' });
        if (response && response.ok && response.data) {
            const prefs = response.data;
            const newCustomGenera = { ...(prefs.customGenera || {}) };
            delete newCustomGenera[domain];
            await chrome.runtime.sendMessage({
                type: 'savePreferences',
                payload: { customGenera: newCustomGenera }
            });
            loadCustomGenera();
            loadTabs();
        }
    }
    catch (e) {
        console.error("Failed to delete custom genera", e);
    }
}
document.addEventListener('click', (event) => {
    const target = event.target;
    if (target && target.id === 'add-genera-btn') {
        addCustomGenera();
    }
});
async function loadTabs() {
    const tabs = await chrome.tabs.query({});
    currentTabs = tabs;
    const totalTabsEl = document.getElementById('totalTabs');
    if (totalTabsEl) {
        totalTabsEl.textContent = tabs.length.toString();
    }
    // Create a map of tab ID to title for parent lookup
    tabTitles.clear();
    tabs.forEach(tab => {
        if (tab.id !== undefined) {
            tabTitles.set(tab.id, tab.title || 'Untitled');
        }
    });
    // Convert to TabMetadata for context analysis
    const mappedTabs = getMappedTabs();
    // Analyze context
    try {
        currentContextMap = await (0, contextAnalysis_js_1.analyzeTabContext)(mappedTabs);
    }
    catch (error) {
        console.error("Failed to analyze context", error);
        currentContextMap.clear();
    }
    renderTable();
}
function getMappedTabs() {
    return currentTabs
        .filter((tab) => !!tab.id && !!tab.windowId && !!tab.url && !!tab.title)
        .map(tab => {
        const contextResult = currentContextMap.get(tab.id);
        return {
            id: tab.id,
            windowId: tab.windowId,
            title: tab.title,
            url: tab.url,
            pinned: !!tab.pinned,
            lastAccessed: tab.lastAccessed,
            openerTabId: tab.openerTabId,
            favIconUrl: tab.favIconUrl || undefined,
            context: contextResult?.context,
            contextData: contextResult?.data,
            index: tab.index,
            active: tab.active,
            status: tab.status,
            selected: tab.highlighted
        };
    });
}
function handleSort(key) {
    if (sortKey === key) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    }
    else {
        sortKey = key;
        sortDirection = 'asc';
    }
    updateHeaderStyles();
    renderTable();
}
function updateHeaderStyles() {
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.getAttribute('data-key') === sortKey) {
            th.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}
function getSortValue(tab, key) {
    switch (key) {
        case 'parentTitle':
            return tab.openerTabId ? (tabTitles.get(tab.openerTabId) || '') : '';
        case 'genre':
            return (tab.id && currentContextMap.get(tab.id)?.data?.genre) || '';
        case 'context':
            return (tab.id && currentContextMap.get(tab.id)?.context) || '';
        case 'active':
        case 'pinned':
            return tab[key] ? 1 : 0;
        case 'id':
        case 'index':
        case 'windowId':
        case 'groupId':
        case 'openerTabId':
            return tab[key] || -1;
        case 'lastAccessed':
            return tab[key] || 0;
        case 'title':
        case 'url':
        case 'status':
            return (tab[key] || '').toLowerCase();
        default:
            return tab[key];
    }
}
function renderTable() {
    const tbody = document.querySelector('#tabsTable tbody');
    if (!tbody)
        return;
    // 1. Filter
    let tabsDisplay = currentTabs.filter(tab => {
        // Global Search
        if (globalSearchQuery) {
            const q = globalSearchQuery.toLowerCase();
            const searchableText = `${tab.title} ${tab.url} ${tab.id}`.toLowerCase();
            if (!searchableText.includes(q))
                return false;
        }
        // Column Filters
        for (const [key, filter] of Object.entries(columnFilters)) {
            if (!filter)
                continue;
            const val = String(getSortValue(tab, key)).toLowerCase();
            if (!val.includes(filter.toLowerCase()))
                return false;
        }
        return true;
    });
    // 2. Sort
    if (sortKey) {
        tabsDisplay.sort((a, b) => {
            let valA = getSortValue(a, sortKey);
            let valB = getSortValue(b, sortKey);
            if (valA < valB)
                return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB)
                return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }
    tbody.innerHTML = ''; // Clear existing rows
    // 3. Render
    const visibleCols = columns.filter(c => c.visible);
    tabsDisplay.forEach(tab => {
        const row = document.createElement('tr');
        visibleCols.forEach(col => {
            const td = document.createElement('td');
            if (col.key === 'title')
                td.classList.add('title-cell');
            if (col.key === 'url')
                td.classList.add('url-cell');
            const val = getCellValue(tab, col.key);
            if (val instanceof HTMLElement) {
                td.appendChild(val);
            }
            else {
                td.innerHTML = val;
                td.title = stripHtml(String(val));
            }
            row.appendChild(td);
        });
        tbody.appendChild(row);
    });
}
function stripHtml(html) {
    let tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
}
function getCellValue(tab, key) {
    const escape = escapeHtml;
    switch (key) {
        case 'id': return String(tab.id ?? 'N/A');
        case 'index': return String(tab.index);
        case 'windowId': return String(tab.windowId);
        case 'groupId': return String(tab.groupId);
        case 'title': return escape(tab.title || '');
        case 'url': return escape(tab.url || '');
        case 'status': return escape(tab.status || '');
        case 'active': return tab.active ? 'Yes' : 'No';
        case 'pinned': return tab.pinned ? 'Yes' : 'No';
        case 'openerTabId': return String(tab.openerTabId ?? '-');
        case 'parentTitle':
            return escape(tab.openerTabId ? (tabTitles.get(tab.openerTabId) || 'Unknown') : '-');
        case 'genre':
            return escape((tab.id && currentContextMap.get(tab.id)?.data?.genre) || '-');
        case 'context': {
            const contextResult = tab.id ? currentContextMap.get(tab.id) : undefined;
            if (!contextResult)
                return 'N/A';
            let cellStyle = '';
            let aiContext = '';
            if (contextResult.status === 'RESTRICTED') {
                aiContext = 'Unextractable (restricted)';
                cellStyle = 'color: gray; font-style: italic;';
            }
            else if (contextResult.error) {
                aiContext = `Error (${contextResult.error})`;
                cellStyle = 'color: red;';
            }
            else if (contextResult.source === 'Extraction') {
                aiContext = `${contextResult.context} (Extracted)`;
                cellStyle = 'color: green; font-weight: bold;';
            }
            else {
                aiContext = `${contextResult.context}`;
            }
            const container = document.createElement('div');
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.gap = '5px';
            const summaryDiv = document.createElement('div');
            summaryDiv.style.cssText = cellStyle;
            summaryDiv.textContent = aiContext;
            container.appendChild(summaryDiv);
            if (contextResult.data) {
                const details = document.createElement('pre');
                details.style.cssText = 'max-height: 300px; overflow: auto; font-size: 11px; text-align: left; background: #f5f5f5; padding: 5px; border: 1px solid #ddd; margin: 0; white-space: pre-wrap; font-family: monospace;';
                details.textContent = JSON.stringify(contextResult.data, null, 2);
                container.appendChild(details);
            }
            return container;
        }
        case 'lastAccessed':
            return new Date(tab.lastAccessed || 0).toLocaleString();
        case 'actions': {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = `
                <button class="goto-tab-btn" data-tab-id="${tab.id}" data-window-id="${tab.windowId}">Go</button>
                <button class="close-tab-btn" data-tab-id="${tab.id}" style="background-color: #dc3545; margin-left: 2px;">X</button>
            `;
            return wrapper;
        }
        default: return '';
    }
}
function renderAlgorithmsView() {
    // Use updated strategies list including custom ones
    renderStrategyConfig();
    const groupingRef = document.getElementById('grouping-ref');
    const sortingRef = document.getElementById('sorting-ref');
    if (groupingRef) {
        // Re-render because strategy list might change
        const allStrategies = (0, strategyRegistry_js_1.getStrategies)(localCustomStrategies);
        const groupings = allStrategies.filter(s => s.isGrouping);
        groupingRef.innerHTML = groupings.map(g => {
            const isCustom = localCustomStrategies.some(s => s.id === g.id);
            let desc = "Built-in strategy";
            if (isCustom)
                desc = "Custom strategy defined by rules.";
            else if (g.id === 'domain')
                desc = 'Groups tabs by their domain name.';
            else if (g.id === 'topic')
                desc = 'Groups based on keywords in the title.';
            return `
          <div class="strategy-item">
            <div class="strategy-name">${g.label} (${g.id}) ${isCustom ? '<span style="color: blue; font-size: 0.8em;">Custom</span>' : ''}</div>
            <div class="strategy-desc">${desc}</div>
            <button class="strategy-view-btn" data-type="grouping" data-name="${g.id}">View Logic</button>
          </div>
        `;
        }).join('');
    }
    if (sortingRef) {
        // Re-render sorting strategies too
        const allStrategies = (0, strategyRegistry_js_1.getStrategies)(localCustomStrategies);
        const sortings = allStrategies.filter(s => s.isSorting);
        sortingRef.innerHTML = sortings.map(s => {
            let desc = "Built-in sorting";
            if (s.id === 'recency')
                desc = 'Sorts by last accessed time (most recent first).';
            else if (s.id === 'nesting')
                desc = 'Sorts based on hierarchy (roots vs children).';
            else if (s.id === 'pinned')
                desc = 'Keeps pinned tabs at the beginning of the list.';
            return `
      <div class="strategy-item">
        <div class="strategy-name">${s.label}</div>
        <div class="strategy-desc">${desc}</div>
        <button class="strategy-view-btn" data-type="sorting" data-name="${s.id}">View Logic</button>
      </div>
    `;
        }).join('');
    }
    const registryRef = document.getElementById('registry-ref');
    if (registryRef && registryRef.children.length === 0) {
        registryRef.innerHTML = `
        <div class="strategy-item">
            <div class="strategy-name">Genera Registry</div>
            <div class="strategy-desc">Static lookup table for domain classification (approx ${Object.keys(generaRegistry_js_1.GENERA_REGISTRY).length} entries).</div>
            <button class="strategy-view-btn" data-type="registry" data-name="genera">View Table</button>
        </div>
      `;
    }
}
function renderStrategyConfig() {
    const groupingList = document.getElementById('sim-grouping-list');
    const sortingList = document.getElementById('sim-sorting-list');
    // Use dynamic strategy list
    const strategies = (0, strategyRegistry_js_1.getStrategies)(localCustomStrategies);
    if (groupingList) {
        const groupingStrategies = strategies.filter(s => s.isGrouping);
        // We should preserve checked state if re-rendering, but for now just defaulting is okay or reading current DOM
        // Simplification: just re-render.
        renderStrategyList(groupingList, groupingStrategies, ['domain', 'topic']);
    }
    if (sortingList) {
        const sortingStrategies = strategies.filter(s => s.isSorting);
        renderStrategyList(sortingList, sortingStrategies, ['pinned', 'recency']);
    }
}
function renderStrategyList(container, strategies, defaultEnabled) {
    container.innerHTML = '';
    // Sort enabled by their index in defaultEnabled
    const enabled = strategies.filter(s => defaultEnabled.includes(s.id));
    // Safe indexof check since ids are strings in defaultEnabled
    enabled.sort((a, b) => defaultEnabled.indexOf(a.id) - defaultEnabled.indexOf(b.id));
    const disabled = strategies.filter(s => !defaultEnabled.includes(s.id));
    // Initial render order: Enabled (ordered) then Disabled
    const ordered = [...enabled, ...disabled];
    ordered.forEach(strategy => {
        const isChecked = defaultEnabled.includes(strategy.id);
        const row = document.createElement('div');
        row.className = `strategy-row ${isChecked ? '' : 'disabled'}`;
        row.dataset.id = strategy.id;
        row.draggable = true;
        row.innerHTML = `
            <div class="drag-handle">☰</div>
            <input type="checkbox" ${isChecked ? 'checked' : ''}>
            <span class="strategy-label">${strategy.label}</span>
        `;
        // Add listeners
        const checkbox = row.querySelector('input[type="checkbox"]');
        checkbox?.addEventListener('change', (e) => {
            const checked = e.target.checked;
            row.classList.toggle('disabled', !checked);
        });
        addDnDListeners(row, container);
        container.appendChild(row);
    });
}
function addDnDListeners(row, container) {
    row.addEventListener('dragstart', (e) => {
        row.classList.add('dragging');
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            // Set a transparent image or similar if desired, but default is usually fine
        }
    });
    row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
    });
    // The container handles the drop zone logic via dragover
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY);
        const draggable = container.querySelector('.dragging');
        if (draggable) {
            if (afterElement == null) {
                container.appendChild(draggable);
            }
            else {
                container.insertBefore(draggable, afterElement);
            }
        }
    });
}
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
function showModal(title, content) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    modalOverlay.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3>${escapeHtml(title)}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-content"></div>
        </div>
    `;
    const contentContainer = modalOverlay.querySelector('.modal-content');
    if (typeof content === 'string') {
        contentContainer.innerHTML = content;
    }
    else {
        contentContainer.appendChild(content);
    }
    document.body.appendChild(modalOverlay);
    const closeBtn = modalOverlay.querySelector('.modal-close');
    closeBtn?.addEventListener('click', () => {
        document.body.removeChild(modalOverlay);
    });
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            document.body.removeChild(modalOverlay);
        }
    });
}
function showStrategyDetails(type, name) {
    let content = "";
    let title = `${name} (${type})`;
    if (type === 'grouping') {
        if (name === 'domain') {
            content = `
<h3>Logic: Domain Extraction</h3>
<pre><code>${escapeHtml(groupingStrategies_js_1.domainFromUrl.toString())}</code></pre>
<h3>Logic: Grouping Key</h3>
<pre><code>${escapeHtml(groupingStrategies_js_1.groupingKey.toString())}</code></pre>
            `;
        }
        else if (name === 'topic') {
            content = `
<h3>Logic: Semantic Bucketing</h3>
<pre><code>${escapeHtml(groupingStrategies_js_1.semanticBucket.toString())}</code></pre>
<h3>Logic: Grouping Key</h3>
<pre><code>${escapeHtml(groupingStrategies_js_1.groupingKey.toString())}</code></pre>
            `;
        }
        else if (name === 'lineage') {
            content = `
<h3>Logic: Navigation Key</h3>
<pre><code>${escapeHtml(groupingStrategies_js_1.navigationKey.toString())}</code></pre>
<h3>Logic: Grouping Key</h3>
<pre><code>${escapeHtml(groupingStrategies_js_1.groupingKey.toString())}</code></pre>
            `;
        }
        else {
            // Check for custom strategy details
            const custom = localCustomStrategies.find(s => s.id === name);
            if (custom) {
                content = `
<h3>Custom Strategy: ${escapeHtml(custom.label)}</h3>
<p><b>Configuration:</b></p>
<pre><code>${escapeHtml(JSON.stringify(custom, null, 2))}</code></pre>
<h3>Logic: Grouping Key</h3>
<pre><code>${escapeHtml(groupingStrategies_js_1.groupingKey.toString())}</code></pre>
                `;
            }
            else {
                content = `
<h3>Logic: Grouping Key</h3>
<pre><code>${escapeHtml(groupingStrategies_js_1.groupingKey.toString())}</code></pre>
                `;
            }
        }
    }
    else if (type === 'sorting') {
        content = `
<h3>Logic: Comparison Function</h3>
<pre><code>${escapeHtml(sortingStrategies_js_1.compareBy.toString())}</code></pre>
        `;
        if (name === 'recency') {
            content += `<h3>Logic: Recency Score</h3><pre><code>${escapeHtml(sortingStrategies_js_1.recencyScore.toString())}</code></pre>`;
        }
        else if (name === 'nesting') {
            content += `<h3>Logic: Hierarchy Score</h3><pre><code>${escapeHtml(sortingStrategies_js_1.hierarchyScore.toString())}</code></pre>`;
        }
        else if (name === 'pinned') {
            content += `<h3>Logic: Pinned Score</h3><pre><code>${escapeHtml(sortingStrategies_js_1.pinnedScore.toString())}</code></pre>`;
        }
    }
    else if (type === 'registry' && name === 'genera') {
        const json = JSON.stringify(generaRegistry_js_1.GENERA_REGISTRY, null, 2);
        content = `
<h3>Genera Registry Data</h3>
<p>Mapping of domain names to categories.</p>
<pre><code>${escapeHtml(json)}</code></pre>
        `;
    }
    showModal(title, content);
}
function getEnabledStrategiesFromUI(container) {
    return Array.from(container.children)
        .filter(row => row.querySelector('input[type="checkbox"]').checked)
        .map(row => row.dataset.id);
}
function runSimulation() {
    const groupingList = document.getElementById('sim-grouping-list');
    const sortingList = document.getElementById('sim-sorting-list');
    const resultContainer = document.getElementById('simResults');
    if (!groupingList || !sortingList || !resultContainer)
        return;
    const groupingStrats = getEnabledStrategiesFromUI(groupingList);
    const sortingStrats = getEnabledStrategiesFromUI(sortingList);
    // Prepare data
    let tabs = getMappedTabs();
    // 1. Sort
    if (sortingStrats.length > 0) {
        tabs = (0, sortingStrategies_js_1.sortTabs)(tabs, sortingStrats);
    }
    // 2. Group
    const groups = (0, groupingStrategies_js_1.groupTabs)(tabs, groupingStrats);
    // 3. Render
    if (groups.length === 0) {
        resultContainer.innerHTML = '<p>No groups created (are there any tabs?).</p>';
        return;
    }
    resultContainer.innerHTML = groups.map(group => `
    <div class="group-result">
      <div class="group-header" style="border-left: 5px solid ${group.color}">
        <span>${escapeHtml(group.label || 'Ungrouped')}</span>
        <span class="group-meta">${group.tabs.length} tabs &bull; Reason: ${escapeHtml(group.reason)}</span>
      </div>
      <ul class="group-tabs">
        ${group.tabs.map(tab => `
          <li class="group-tab-item">
            ${tab.favIconUrl ? `<img src="${tab.favIconUrl}" class="tab-icon" onerror="this.style.display='none'">` : '<div class="tab-icon"></div>'}
            <span class="title-cell" title="${escapeHtml(tab.title)}">${escapeHtml(tab.title)}</span>
            <span style="color: #999; font-size: 0.8em; margin-left: auto;">${escapeHtml(new URL(tab.url).hostname)}</span>
          </li>
        `).join('')}
      </ul>
    </div>
  `).join('');
}
async function applyToBrowser() {
    const groupingList = document.getElementById('sim-grouping-list');
    const sortingList = document.getElementById('sim-sorting-list');
    if (!groupingList || !sortingList)
        return;
    const groupingStrats = getEnabledStrategiesFromUI(groupingList);
    const sortingStrats = getEnabledStrategiesFromUI(sortingList);
    // Combine strategies.
    // We prioritize grouping strategies first, then sorting strategies,
    // as the backend filters them when performing actions.
    const allStrategies = [...groupingStrats, ...sortingStrats];
    try {
        // 1. Save Preferences
        await chrome.runtime.sendMessage({
            type: 'savePreferences',
            payload: { sorting: allStrategies }
        });
        // 2. Trigger Apply Grouping (which uses the new preferences)
        const response = await chrome.runtime.sendMessage({
            type: 'applyGrouping',
            payload: {
                sorting: allStrategies // Pass explicitly to ensure immediate effect
            }
        });
        if (response && response.ok) {
            alert("Applied successfully!");
            loadTabs(); // Refresh data
        }
        else {
            alert("Failed to apply: " + (response.error || 'Unknown error'));
        }
    }
    catch (e) {
        console.error("Apply failed", e);
        alert("Apply failed: " + e);
    }
}
function escapeHtml(text) {
    if (!text)
        return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
async function renderLiveView() {
    const container = document.getElementById('live-view-container');
    if (!container)
        return;
    try {
        const tabs = await chrome.tabs.query({});
        const groups = await chrome.tabGroups.query({});
        const groupMap = new Map(groups.map(g => [g.id, g]));
        const windows = new Set(tabs.map(t => t.windowId));
        const windowIds = Array.from(windows).sort((a, b) => a - b);
        let html = '<div style="font-size: 0.9em; color: #666; margin-bottom: 10px;">Select items below to simulate specific selection states.</div>';
        for (const winId of windowIds) {
            const winTabs = tabs.filter(t => t.windowId === winId);
            const winSelected = winTabs.every(t => t.id && simulatedSelection.has(t.id));
            html += `<div class="selectable-item ${winSelected ? 'selected' : ''}" data-type="window" data-id="${winId}" style="margin-bottom: 15px; border-radius: 4px; padding: 5px;">`;
            html += `<div style="font-weight: bold;">Window ${winId}</div>`;
            // Organize by group
            const winGroups = new Map();
            const ungrouped = [];
            winTabs.forEach(t => {
                if (t.groupId !== -1) {
                    if (!winGroups.has(t.groupId))
                        winGroups.set(t.groupId, []);
                    winGroups.get(t.groupId).push(t);
                }
                else {
                    ungrouped.push(t);
                }
            });
            // Render Ungrouped
            if (ungrouped.length > 0) {
                html += `<div style="margin-left: 10px; margin-top: 5px;">`;
                html += `<div style="font-size: 0.9em; color: #555;">Ungrouped (${ungrouped.length})</div>`;
                ungrouped.forEach(t => {
                    const isSelected = t.id && simulatedSelection.has(t.id);
                    html += `<div class="selectable-item ${isSelected ? 'selected' : ''}" data-type="tab" data-id="${t.id}" style="margin-left: 10px; padding: 2px 5px; border-radius: 3px; cursor: pointer; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">- ${escapeHtml(t.title || 'Untitled')}</div>`;
                });
                html += `</div>`;
            }
            // Render Groups
            for (const [groupId, gTabs] of winGroups) {
                const groupInfo = groupMap.get(groupId);
                const color = groupInfo?.color || 'grey';
                const title = groupInfo?.title || 'Untitled Group';
                const groupSelected = gTabs.every(t => t.id && simulatedSelection.has(t.id));
                html += `<div class="selectable-item ${groupSelected ? 'selected' : ''}" data-type="group" data-id="${groupId}" style="margin-left: 10px; margin-top: 5px; border-left: 3px solid ${color}; padding-left: 5px; padding: 5px; border-radius: 3px;">`;
                html += `<div style="font-weight: bold; font-size: 0.9em;">${escapeHtml(title)} (${gTabs.length})</div>`;
                gTabs.forEach(t => {
                    const isSelected = t.id && simulatedSelection.has(t.id);
                    html += `<div class="selectable-item ${isSelected ? 'selected' : ''}" data-type="tab" data-id="${t.id}" style="margin-left: 10px; padding: 2px 5px; border-radius: 3px; cursor: pointer; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">- ${escapeHtml(t.title || 'Untitled')}</div>`;
                });
                html += `</div>`;
            }
            html += `</div>`;
        }
        container.innerHTML = html;
    }
    catch (e) {
        container.innerHTML = `<p style="color:red">Error loading live view: ${e}</p>`;
    }
}
