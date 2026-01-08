import { analyzeTabContext, ContextResult } from "../background/contextAnalysis.js";
import {
  groupTabs,
  domainFromUrl,
  semanticBucket,
  navigationKey,
  groupingKey,
  getFieldValue
} from "../background/groupingStrategies.js";
import { GENERA_REGISTRY } from "../background/extraction/generaRegistry.js";
import {
  sortTabs,
  recencyScore,
  hierarchyScore,
  pinnedScore,
  compareBy,
  setCustomStrategiesForSorting
} from "../background/sortingStrategies.js";
import { setCustomStrategies } from "../background/groupingStrategies.js";
import { GroupingStrategy, Preferences, SortingStrategy, TabMetadata, TabGroup, CustomStrategy, StrategyRule, RuleCondition, SortRule } from "../shared/types.js";
import { STRATEGIES, StrategyDefinition, getStrategies } from "../shared/strategyRegistry.js";

// Types
interface ColumnDefinition {
    key: string;
    label: string;
    visible: boolean;
    width: string; // CSS width
    filterable: boolean;
}

// State
let currentTabs: chrome.tabs.Tab[] = [];
let localCustomStrategies: CustomStrategy[] = [];
let currentContextMap = new Map<number, ContextResult>();
let tabTitles = new Map<number, string>();
let sortKey: string | null = null;
let sortDirection: 'asc' | 'desc' = 'asc';

// Modern Table State
let globalSearchQuery = '';
let columnFilters: Record<string, string> = {};
let columns: ColumnDefinition[] = [
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
      const targetId = (btn as HTMLElement).dataset.target;
      if (targetId) {
        document.getElementById(targetId)?.classList.add('active');
      }

      // If switching to algorithms, populate reference if empty
      if (targetId === 'view-algorithms') {
         renderAlgorithmsView();
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
  const globalSearchInput = document.getElementById('globalSearch') as HTMLInputElement;
  if (globalSearchInput) {
      globalSearchInput.addEventListener('input', (e) => {
          globalSearchQuery = (e.target as HTMLInputElement).value;
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
          if (globalSearchInput) globalSearchInput.value = '';
          columnFilters = {};
          renderTableHeader();
          renderTable();
      });
  }

  // Hide column menu when clicking outside
  document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
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
    const target = event.target as HTMLElement | null;
    if (!target) return;

    if (target.matches('.context-json-btn')) {
      const tabId = Number(target.dataset.tabId);
      if (!tabId) return;
      const data = currentContextMap.get(tabId)?.data;
      if (!data) return;
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
    } else if (target.matches('.goto-tab-btn')) {
      const tabId = Number(target.dataset.tabId);
      const windowId = Number(target.dataset.windowId);
      if (tabId && windowId) {
        chrome.tabs.update(tabId, { active: true });
        chrome.windows.update(windowId, { focused: true });
      }
    } else if (target.matches('.close-tab-btn')) {
      const tabId = Number(target.dataset.tabId);
      if (tabId) {
        chrome.tabs.remove(tabId);
      }
    } else if (target.matches('.strategy-view-btn')) {
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
  initStrategyEditor();
});

// Column Management

function renderColumnsMenu() {
    const menu = document.getElementById('columnsMenu');
    if (!menu) return;

    menu.innerHTML = columns.map(col => `
        <label class="column-toggle">
            <input type="checkbox" data-key="${col.key}" ${col.visible ? 'checked' : ''}>
            ${escapeHtml(col.label)}
        </label>
    `).join('');

    menu.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', (e) => {
            const key = (e.target as HTMLInputElement).dataset.key;
            const checked = (e.target as HTMLInputElement).checked;
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
    if (!headerRow || !filterRow) return;

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
        if (!col.filterable) return '<th></th>';
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
            if ((e.target as HTMLElement).classList.contains('resizer')) return;

            const key = th.getAttribute('data-key');
            if (key) handleSort(key);
        });
    });

    // Attach Filter Listeners
    filterRow.querySelectorAll('.filter-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const key = (e.target as HTMLElement).dataset.key;
            const val = (e.target as HTMLInputElement).value;
            if (key) {
                columnFilters[key] = val;
                renderTable();
            }
        });
    });

    // Attach Resize Listeners
    headerRow.querySelectorAll('.resizer').forEach(resizer => {
        initResize(resizer as HTMLElement);
    });

    updateHeaderStyles();
}

function initResize(resizer: HTMLElement) {
    let x = 0;
    let w = 0;
    let th: HTMLElement;

    const mouseDownHandler = (e: MouseEvent) => {
        th = resizer.parentElement as HTMLElement;
        x = e.clientX;
        w = th.offsetWidth;

        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
        resizer.classList.add('resizing');
    };

    const mouseMoveHandler = (e: MouseEvent) => {
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
            const prefs = response.data as Preferences;
            localCustomStrategies = prefs.customStrategies || [];
            setCustomStrategies(localCustomStrategies);
            setCustomStrategiesForSorting(localCustomStrategies);
        }
    } catch (e) {
        console.error("Failed to load preferences", e);
    }
}

async function loadCustomGenera() {
    const listContainer = document.getElementById('custom-genera-list');
    if (!listContainer) return;

    try {
        const response = await chrome.runtime.sendMessage({ type: 'loadPreferences' });
        if (response && response.ok && response.data) {
            const prefs = response.data as Preferences;
            renderCustomGeneraList(prefs.customGenera || {});
        }
    } catch (e) {
        console.error("Failed to load custom genera", e);
    }
}

function initStrategyEditor() {
    const addGroupBtn = document.getElementById('add-group-btn');
    const addSortBtn = document.getElementById('add-sort-btn');
    const saveStratBtn = document.getElementById('save-strat-btn');
    const runBuilderBtn = document.getElementById('run-builder-btn');

    if (addGroupBtn) {
        addGroupBtn.addEventListener('click', () => {
             addRuleRow();
        });
    }

    if (addSortBtn) {
        addSortBtn.addEventListener('click', () => {
            addSortRow();
        });
    }

    if (saveStratBtn) {
        saveStratBtn.addEventListener('click', saveCustomStrategy);
    }

    if (runBuilderBtn) {
        runBuilderBtn.addEventListener('click', runBuilderSimulation);
    }

    renderStrategiesList();
}

function renderStrategiesList() {
    const container = document.getElementById('custom-strategies-list');
    if (!container) return;

    const allStrategies = getStrategies(localCustomStrategies);

    if (allStrategies.length === 0) {
        container.innerHTML = '<p style="color: #888;">No strategies found.</p>';
        return;
    }

    container.innerHTML = allStrategies.map(s => {
        const isCustom = localCustomStrategies.some(cs => cs.id === s.id);
        const isBuiltIn = STRATEGIES.some(bs => bs.id === s.id);

        let typeLabel = '';
        if (isCustom && isBuiltIn) typeLabel = '<span style="color: orange; font-size: 0.8em;">Overrides Built-in</span>';
        else if (isCustom) typeLabel = '<span style="color: blue; font-size: 0.8em;">Custom</span>';
        else typeLabel = '<span style="color: gray; font-size: 0.8em;">Built-in</span>';

        let actions = '';
        if (isCustom) {
            actions += `<button class="edit-strat-btn" data-id="${escapeHtml(String(s.id))}">Edit</button> `;
            actions += `<button class="delete-strat-btn" data-id="${escapeHtml(String(s.id))}" style="color: red;">${isBuiltIn ? 'Restore' : 'Delete'}</button>`;
        } else {
            actions += `<button class="override-strat-btn" data-id="${escapeHtml(String(s.id))}" data-label="${escapeHtml(s.label)}">Override</button>`;
        }

        return `
        <div style="border: 1px solid #ddd; padding: 10px; margin-bottom: 5px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; background-color: ${isCustom ? '#f9faff' : '#fff'};">
            <div>
                <strong>${escapeHtml(s.label)}</strong> (${escapeHtml(String(s.id))})
                ${typeLabel}
                ${isCustom ? `<div style="font-size: 0.8em; color: #666;">${localCustomStrategies.find(c => c.id === s.id)?.rules.length || 0} rules</div>` : ''}
            </div>
            <div>
                ${actions}
            </div>
        </div>
        `;
    }).join('');

    // Attach listeners
    container.querySelectorAll('.delete-strat-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = (e.target as HTMLElement).dataset.id;
            const isBuiltIn = STRATEGIES.some(s => s.id === id);
            const action = isBuiltIn ? "Restore built-in strategy" : "Delete strategy";

            if (id && confirm(`${action} "${id}"?`)) {
                await deleteCustomStrategy(id);
            }
        });
    });

    container.querySelectorAll('.edit-strat-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = (e.target as HTMLElement).dataset.id;
            const strat = localCustomStrategies.find(s => s.id === id);
            if (strat) {
                populateStrategyEditor(strat);
                document.querySelector('.strategy-builder-header')?.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    container.querySelectorAll('.override-strat-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = (e.target as HTMLElement).dataset.id;
            const label = (e.target as HTMLElement).dataset.label;

            // Populate form basic info
            (document.getElementById('new-strat-id') as HTMLInputElement).value = id || '';
            (document.getElementById('new-strat-label') as HTMLInputElement).value = label || '';
            (document.getElementById('new-strat-fallback') as HTMLInputElement).value = '';

            // Clear rules
            const rulesList = document.getElementById('rules-list');
            if (rulesList) rulesList.innerHTML = '';
            const sortList = document.getElementById('sort-list');
            if (sortList) sortList.innerHTML = '';

            // Add one empty rule to start
            addRuleRow();

            // Scroll to editor
            document.querySelector('.strategy-builder-header')?.scrollIntoView({ behavior: 'smooth' });
        });
    });
}

function populateStrategyEditor(strat: CustomStrategy) {
    (document.getElementById('new-strat-id') as HTMLInputElement).value = strat.id;
    (document.getElementById('new-strat-label') as HTMLInputElement).value = strat.label;
    (document.getElementById('new-strat-fallback') as HTMLInputElement).value = strat.fallback || '';

    const rulesList = document.getElementById('rules-list');
    if (rulesList) {
        rulesList.innerHTML = '';
        strat.rules.forEach(r => addRuleRow(r));
    }

    const sortList = document.getElementById('sort-list');
    if (sortList) {
        sortList.innerHTML = '';
        if (strat.sortRules && strat.sortRules.length > 0) {
            strat.sortRules.forEach(s => addSortRow(s));
        }
    }
}

function addRuleRow(data?: StrategyRule) {
    const rulesList = document.getElementById('rules-list');
    if (!rulesList) return;

    const rowId = 'rule-' + Date.now() + Math.random().toString(36).substring(7);

    const div = document.createElement('div');
    div.className = 'rule-row-container';
    div.style.marginBottom = '10px';
    div.style.padding = '10px';
    div.style.backgroundColor = '#f9f9f9';
    div.style.border = '1px solid #eee';
    div.style.borderRadius = '4px';

    div.innerHTML = `
        <div class="conditions-list" id="${rowId}-conditions"></div>
        <div style="display: flex; gap: 5px; margin-top: 5px; align-items: center;">
            <div style="flex: 1; display: flex; align-items: center; gap: 5px; background: #eef; padding: 5px; border-radius: 4px;">
                 <span style="font-weight: bold; font-size: 0.9em; white-space: nowrap;">Group By:</span>
                 <input type="text" class="rule-result" placeholder="Group Name (e.g. Social Media or $1)" style="flex: 1;" value="${data?.result || ''}">
            </div>
            <button class="remove-rule-btn" style="color: red; padding: 5px;">Delete Rule Group</button>
        </div>
    `;

    // Add initial conditions
    const conditionsContainer = div.querySelector('.conditions-list');
    if (conditionsContainer) {
        if (data && data.conditions) {
            data.conditions.forEach((c, index) => addConditionRow(conditionsContainer, c, index === 0));
        } else if (data && (data as any).field) {
            // Migration for old flat structure
             addConditionRow(conditionsContainer, {
                field: (data as any).field,
                operator: (data as any).operator,
                value: (data as any).value
             }, true);
        } else {
             addConditionRow(conditionsContainer, undefined, true);
        }
    }

    div.querySelector('.remove-rule-btn')?.addEventListener('click', () => {
        div.remove();
    });

    rulesList.appendChild(div);
}

function addConditionRow(container: Element, data?: RuleCondition, isFirst: boolean = false) {
    const conditionDiv = document.createElement('div');
    conditionDiv.className = 'condition-row';
    conditionDiv.style.display = 'flex';
    conditionDiv.style.gap = '5px';
    conditionDiv.style.marginBottom = '5px';
    conditionDiv.style.alignItems = 'center';

    const fieldOptions = `
        <option value="url">URL</option>
        <option value="title">Title</option>
        <option value="domain">Domain</option>
        <option value="genre">Genre</option>
        <option value="siteName">Site Name</option>
        <option value="platform">Platform</option>
        <option value="context">Context Label</option>
        <option value="pinned">Pinned</option>
    `;

    const operatorOptions = `
        <option value="contains">contains</option>
        <option value="equals">equals</option>
        <option value="startsWith">starts with</option>
        <option value="endsWith">ends with</option>
        <option value="matches">matches regex</option>
    `;

    conditionDiv.innerHTML = `
        ${!isFirst ? '<span style="font-weight: bold; color: #666; font-size: 0.8em; padding: 0 5px;">AND</span>' : ''}
        <select class="cond-field" style="width: 100px;">${fieldOptions}</select>
        <select class="cond-operator" style="width: 120px;">${operatorOptions}</select>
        <input type="text" class="cond-value" placeholder="Value" style="flex: 1;">
        <button class="add-condition-btn" style="padding: 2px 8px; font-size: 0.8em;">AND</button>
        <button class="remove-condition-btn" style="color: red; visibility: ${isFirst ? 'hidden' : 'visible'};">&times;</button>
    `;

    if (data) {
        (conditionDiv.querySelector('.cond-field') as HTMLSelectElement).value = data.field;
        (conditionDiv.querySelector('.cond-operator') as HTMLSelectElement).value = data.operator;
        (conditionDiv.querySelector('.cond-value') as HTMLInputElement).value = data.value;
    }

    // Handlers
    conditionDiv.querySelector('.add-condition-btn')?.addEventListener('click', () => {
        addConditionRow(container, undefined, false);
    });

    conditionDiv.querySelector('.remove-condition-btn')?.addEventListener('click', () => {
        conditionDiv.remove();
    });

    container.appendChild(conditionDiv);
}

function addSortRow(data?: SortRule) {
    const sortList = document.getElementById('sort-list');
    if (!sortList) return;

    const div = document.createElement('div');
    div.className = 'sort-row';
    div.style.display = 'flex';
    div.style.gap = '5px';
    div.style.marginBottom = '5px';
    div.style.alignItems = 'center';

    const fieldOptions = `
        <option value="domain">Domain</option>
        <option value="url">URL</option>
        <option value="title">Title</option>
        <option value="recency">Last Accessed</option>
        <option value="pinned">Pinned Status</option>
        <option value="genre">Genre</option>
    `;

    div.innerHTML = `
        <select class="sort-field" style="flex: 1;">${fieldOptions}</select>
        <select class="sort-order" style="width: 100px;">
            <option value="asc">a to z (asc)</option>
            <option value="desc">z to a (desc)</option>
        </select>
        <button class="remove-sort-btn" style="color: red;">Delete</button>
    `;

    if (data) {
        (div.querySelector('.sort-field') as HTMLSelectElement).value = data.field;
        (div.querySelector('.sort-order') as HTMLSelectElement).value = data.order;
    }

    div.querySelector('.remove-sort-btn')?.addEventListener('click', () => {
        div.remove();
    });

    sortList.appendChild(div);
}

async function runBuilderSimulation() {
    const strategy = constructStrategyFromBuilder();
    if (!strategy) return; // Validation failed

    // Use current tabs
    let tabs = getMappedTabs();

    // 1. Sort using custom strategy rules
    // We need to inject this temp strategy into the customStrategies array temporarily
    // OR we can manually invoke sort logic.
    // The `sortTabs` function takes strategy IDs.
    // But we can invoke `compareBy` directly or mock the behavior.
    // Better: Update the global `customStrategies` variable locally with this temp strategy
    const tempStrategies = [...localCustomStrategies.filter(s => s.id !== strategy.id), strategy];
    setCustomStrategies(tempStrategies);
    setCustomStrategiesForSorting(tempStrategies);

    // Apply Sort
    // We want to sort by *this* strategy
    // If this strategy has sort rules, `compareBy` will use them if we pass the strategy ID
    tabs = sortTabs(tabs, [strategy.id]);

    // 2. Group using this strategy
    const groups = groupTabs(tabs, [strategy.id]);

    // 3. Render Results
    renderBuilderResults(tabs, groups);

    // Restore original strategies
    setCustomStrategies(localCustomStrategies);
    setCustomStrategiesForSorting(localCustomStrategies);
}

function renderBuilderResults(tabs: TabMetadata[], groups: TabGroup[]) {
    const tbody = document.querySelector('#builderResultsTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Create a map for fast group lookup
    const tabGroupMap = new Map<number, string>();
    groups.forEach(g => {
        g.tabs.forEach(t => tabGroupMap.set(t.id, g.label));
    });

    let index = 1;
    tabs.forEach(tab => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #eee';

        row.innerHTML = `
            <td style="padding: 5px;">${index++}</td>
            <td style="padding: 5px;">${escapeHtml(tab.title).substring(0, 40)}...</td>
            <td style="padding: 5px; font-size: 0.9em; color: #666;">${escapeHtml(tab.url).substring(0, 40)}...</td>
            <td style="padding: 5px;">${escapeHtml(domainFromUrl(tab.url))}</td>
            <td style="padding: 5px;"><b>${escapeHtml(tabGroupMap.get(tab.id) || 'Ungrouped')}</b></td>
            <td style="padding: 5px;">${index-1}</td>
        `;
        tbody.appendChild(row);
    });
}

function constructStrategyFromBuilder(): CustomStrategy | null {
    const idInput = document.getElementById('new-strat-id') as HTMLInputElement;
    const labelInput = document.getElementById('new-strat-label') as HTMLInputElement;
    const fallbackInput = document.getElementById('new-strat-fallback') as HTMLInputElement;
    const rulesList = document.getElementById('rules-list');
    const sortList = document.getElementById('sort-list');

    if (!idInput || !labelInput || !rulesList) return null;

    const id = idInput.value.trim();
    const label = labelInput.value.trim();
    const fallback = fallbackInput ? fallbackInput.value.trim() : undefined;

    if (!id || !label) {
        alert("Please enter ID and Label");
        return null;
    }

    // Collect Rules
    const rules: StrategyRule[] = [];
    rulesList.querySelectorAll('.rule-row-container').forEach(row => {
        const result = (row.querySelector('.rule-result') as HTMLInputElement).value;
        const conditions: RuleCondition[] = [];

        row.querySelectorAll('.condition-row').forEach(condRow => {
            const field = (condRow.querySelector('.cond-field') as HTMLSelectElement).value;
            const operator = (condRow.querySelector('.cond-operator') as HTMLSelectElement).value as any;
            const value = (condRow.querySelector('.cond-value') as HTMLInputElement).value;

            if (value) {
                conditions.push({ field, operator, value });
            }
        });

        if (conditions.length > 0 && result) {
            rules.push({ conditions, result });
        }
    });

    if (rules.length === 0) {
        alert("Please add at least one valid rule with conditions and a group name.");
        return null;
    }

    // Collect Sort Rules
    const sortRules: SortRule[] = [];
    if (sortList) {
        sortList.querySelectorAll('.sort-row').forEach(row => {
            const field = (row.querySelector('.sort-field') as HTMLSelectElement).value;
            const order = (row.querySelector('.sort-order') as HTMLSelectElement).value as 'asc' | 'desc';
            sortRules.push({ field, order });
        });
    }

    return {
        id,
        label,
        type: 'grouping', // Default base type
        rules,
        sortRules,
        fallback
    };
}

async function saveCustomStrategy() {
    const newStrategy = constructStrategyFromBuilder();
    if (!newStrategy) return;

    try {
        // Fetch current to merge
        const response = await chrome.runtime.sendMessage({ type: 'loadPreferences' });
        if (response && response.ok && response.data) {
            const prefs = response.data as Preferences;
            let currentStrategies = prefs.customStrategies || [];

            // Remove existing if same ID
            currentStrategies = currentStrategies.filter(s => s.id !== newStrategy.id);
            currentStrategies.push(newStrategy);

            await chrome.runtime.sendMessage({
                type: 'savePreferences',
                payload: { customStrategies: currentStrategies }
            });

            // Update local state
            localCustomStrategies = currentStrategies;
            setCustomStrategies(localCustomStrategies);
            setCustomStrategiesForSorting(localCustomStrategies);

            // Reset form
            (document.getElementById('new-strat-id') as HTMLInputElement).value = '';
            (document.getElementById('new-strat-label') as HTMLInputElement).value = '';
            const fallbackInput = document.getElementById('new-strat-fallback') as HTMLInputElement;
            if (fallbackInput) fallbackInput.value = '';

            const rulesList = document.getElementById('rules-list');
            if (rulesList) rulesList.innerHTML = '';
            const sortList = document.getElementById('sort-list');
            if (sortList) sortList.innerHTML = '';

            // Add initial empty rule
            addRuleRow();

            renderStrategiesList();
            renderAlgorithmsView(); // Refresh algo lists
            alert("Strategy saved!");
        }
    } catch (e) {
        console.error("Failed to save strategy", e);
        alert("Error saving strategy");
    }
}

async function deleteCustomStrategy(id: string) {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'loadPreferences' });
        if (response && response.ok && response.data) {
            const prefs = response.data as Preferences;
            const newStrategies = (prefs.customStrategies || []).filter(s => s.id !== id);

            await chrome.runtime.sendMessage({
                type: 'savePreferences',
                payload: { customStrategies: newStrategies }
            });

            localCustomStrategies = newStrategies;
            setCustomStrategies(localCustomStrategies);
            setCustomStrategiesForSorting(localCustomStrategies);
            renderStrategiesList();
            renderAlgorithmsView();
        }
    } catch (e) {
        console.error("Failed to delete strategy", e);
    }
}

function renderCustomGeneraList(customGenera: Record<string, string>) {
    const listContainer = document.getElementById('custom-genera-list');
    if (!listContainer) return;

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
            const domain = (e.target as HTMLElement).dataset.domain;
            if (domain) {
                await deleteCustomGenera(domain);
            }
        });
    });
}

async function addCustomGenera() {
    const domainInput = document.getElementById('new-genera-domain') as HTMLInputElement;
    const categoryInput = document.getElementById('new-genera-category') as HTMLInputElement;

    if (!domainInput || !categoryInput) return;

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
            const prefs = response.data as Preferences;
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
    } catch (e) {
        console.error("Failed to add custom genera", e);
    }
}

async function deleteCustomGenera(domain: string) {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'loadPreferences' });
        if (response && response.ok && response.data) {
            const prefs = response.data as Preferences;
            const newCustomGenera = { ...(prefs.customGenera || {}) };
            delete newCustomGenera[domain];

            await chrome.runtime.sendMessage({
                type: 'savePreferences',
                payload: { customGenera: newCustomGenera }
            });

            loadCustomGenera();
            loadTabs();
        }
    } catch (e) {
        console.error("Failed to delete custom genera", e);
    }
}

document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
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
  const mappedTabs: TabMetadata[] = getMappedTabs();

  // Analyze context
  try {
      currentContextMap = await analyzeTabContext(mappedTabs);
  } catch (error) {
      console.error("Failed to analyze context", error);
      currentContextMap.clear();
  }

  renderTable();
}

function getMappedTabs(): TabMetadata[] {
  return currentTabs
    .filter((tab): tab is chrome.tabs.Tab & { id: number; windowId: number; url: string; title: string } =>
      !!tab.id && !!tab.windowId && !!tab.url && !!tab.title
    )
    .map(tab => {
      const contextResult = currentContextMap.get(tab.id);
      return {
        id: tab.id,
        windowId: tab.windowId,
        title: tab.title,
        url: tab.url,
        pinned: !!tab.pinned,
        lastAccessed: (tab as any).lastAccessed,
        openerTabId: tab.openerTabId,
        favIconUrl: tab.favIconUrl || undefined,
        context: contextResult?.context,
        contextData: contextResult?.data,
        groupId: tab.groupId,
        index: tab.index,
        active: tab.active,
        status: tab.status
      };
    });
}

function handleSort(key: string) {
  if (sortKey === key) {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
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

function getSortValue(tab: chrome.tabs.Tab, key: string): any {
  switch (key) {
    case 'parentTitle':
      return tab.openerTabId ? (tabTitles.get(tab.openerTabId) || '') : '';
    case 'genre':
      return (tab.id && currentContextMap.get(tab.id)?.data?.genre) || '';
    case 'context':
      return (tab.id && currentContextMap.get(tab.id)?.context) || '';
    case 'active':
    case 'pinned':
      return (tab as any)[key] ? 1 : 0;
    case 'id':
    case 'index':
    case 'windowId':
    case 'groupId':
    case 'openerTabId':
      return (tab as any)[key] || -1;
    case 'lastAccessed':
      return (tab as any)[key] || 0;
    case 'title':
    case 'url':
    case 'status':
      return ((tab as any)[key] || '').toLowerCase();
    default:
      return (tab as any)[key];
  }
}

function renderTable() {
  const tbody = document.querySelector('#tabsTable tbody');
  if (!tbody) return;

  // 1. Filter
  let tabsDisplay = currentTabs.filter(tab => {
      // Global Search
      if (globalSearchQuery) {
          const q = globalSearchQuery.toLowerCase();
          const searchableText = `${tab.title} ${tab.url} ${tab.id}`.toLowerCase();
          if (!searchableText.includes(q)) return false;
      }

      // Column Filters
      for (const [key, filter] of Object.entries(columnFilters)) {
          if (!filter) continue;
          const val = String(getSortValue(tab, key)).toLowerCase();
          if (!val.includes(filter.toLowerCase())) return false;
      }

      return true;
  });

  // 2. Sort
  if (sortKey) {
    tabsDisplay.sort((a, b) => {
      let valA: any = getSortValue(a, sortKey!);
      let valB: any = getSortValue(b, sortKey!);

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
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
        if (col.key === 'title') td.classList.add('title-cell');
        if (col.key === 'url') td.classList.add('url-cell');

        const val = getCellValue(tab, col.key);

        if (val instanceof HTMLElement) {
            td.appendChild(val);
        } else {
            td.innerHTML = val;
            td.title = stripHtml(String(val));
        }
        row.appendChild(td);
    });

    tbody.appendChild(row);
  });
}

function stripHtml(html: string) {
    let tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
}


function getCellValue(tab: chrome.tabs.Tab, key: string): string | HTMLElement {
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
            if (!contextResult) return 'N/A';

            let cellStyle = '';
            let aiContext = '';

            if (contextResult.status === 'RESTRICTED') {
                aiContext = 'Unextractable (restricted)';
                cellStyle = 'color: gray; font-style: italic;';
            } else if (contextResult.error) {
                aiContext = `Error (${contextResult.error})`;
                cellStyle = 'color: red;';
            } else if (contextResult.source === 'Extraction') {
                aiContext = `${contextResult.context} (Extracted)`;
                cellStyle = 'color: green; font-weight: bold;';
            } else {
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
            return new Date((tab as any).lastAccessed || 0).toLocaleString();
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
      const allStrategies: StrategyDefinition[] = getStrategies(localCustomStrategies);
      const groupings = allStrategies.filter(s => s.isGrouping);

      groupingRef.innerHTML = groupings.map(g => {
         const isCustom = localCustomStrategies.some(s => s.id === g.id);
         let desc = "Built-in strategy";
         if (isCustom) desc = "Custom strategy defined by rules.";
         else if (g.id === 'domain') desc = 'Groups tabs by their domain name.';
         else if (g.id === 'topic') desc = 'Groups based on keywords in the title.';

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
    const allStrategies: StrategyDefinition[] = getStrategies(localCustomStrategies);
    const sortings = allStrategies.filter(s => s.isSorting);

    sortingRef.innerHTML = sortings.map(s => {
        let desc = "Built-in sorting";
        if (s.id === 'recency') desc = 'Sorts by last accessed time (most recent first).';
        else if (s.id === 'nesting') desc = 'Sorts based on hierarchy (roots vs children).';
        else if (s.id === 'pinned') desc = 'Keeps pinned tabs at the beginning of the list.';

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
            <div class="strategy-desc">Static lookup table for domain classification (approx ${Object.keys(GENERA_REGISTRY).length} entries).</div>
            <button class="strategy-view-btn" data-type="registry" data-name="genera">View Table</button>
        </div>
      `;
  }
}

function renderStrategyConfig() {
  const groupingList = document.getElementById('sim-grouping-list');
  const sortingList = document.getElementById('sim-sorting-list');

  // Use dynamic strategy list
  const strategies: StrategyDefinition[] = getStrategies(localCustomStrategies);

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

function renderStrategyList(container: HTMLElement, strategies: StrategyDefinition[], defaultEnabled: string[]) {
    container.innerHTML = '';

    // Sort enabled by their index in defaultEnabled
    const enabled = strategies.filter(s => defaultEnabled.includes(s.id as string));
    // Safe indexof check since ids are strings in defaultEnabled
    enabled.sort((a, b) => defaultEnabled.indexOf(a.id as string) - defaultEnabled.indexOf(b.id as string));

    const disabled = strategies.filter(s => !defaultEnabled.includes(s.id as string));

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
            const checked = (e.target as HTMLInputElement).checked;
            row.classList.toggle('disabled', !checked);
        });

        addDnDListeners(row, container);

        container.appendChild(row);
    });
}

function addDnDListeners(row: HTMLElement, container: HTMLElement) {
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
      } else {
        container.insertBefore(draggable, afterElement);
      }
    }
  });
}

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

function showStrategyDetails(type: string, name: string) {
    let content = "";
    let title = `${name} (${type})`;

    if (type === 'grouping') {
        if (name === 'domain') {
            content = `
<h3>Logic: Domain Extraction</h3>
<pre><code>${escapeHtml(domainFromUrl.toString())}</code></pre>
<h3>Logic: Grouping Key</h3>
<pre><code>${escapeHtml(groupingKey.toString())}</code></pre>
            `;
        } else if (name === 'topic') {
            content = `
<h3>Logic: Semantic Bucketing</h3>
<pre><code>${escapeHtml(semanticBucket.toString())}</code></pre>
<h3>Logic: Grouping Key</h3>
<pre><code>${escapeHtml(groupingKey.toString())}</code></pre>
            `;
        } else if (name === 'lineage') {
            content = `
<h3>Logic: Navigation Key</h3>
<pre><code>${escapeHtml(navigationKey.toString())}</code></pre>
<h3>Logic: Grouping Key</h3>
<pre><code>${escapeHtml(groupingKey.toString())}</code></pre>
            `;
        } else {
            // Check for custom strategy details
            const custom = localCustomStrategies.find(s => s.id === name);
            if (custom) {
                content = `
<h3>Custom Strategy: ${escapeHtml(custom.label)}</h3>
<p><b>Rules:</b></p>
<pre><code>${escapeHtml(JSON.stringify(custom.rules, null, 2))}</code></pre>
<h3>Logic: Grouping Key</h3>
<pre><code>${escapeHtml(groupingKey.toString())}</code></pre>
                `;
            } else {
                content = `
<h3>Logic: Grouping Key</h3>
<pre><code>${escapeHtml(groupingKey.toString())}</code></pre>
                `;
            }
        }
    } else if (type === 'sorting') {
        content = `
<h3>Logic: Comparison Function</h3>
<pre><code>${escapeHtml(compareBy.toString())}</code></pre>
        `;

        if (name === 'recency') {
             content += `<h3>Logic: Recency Score</h3><pre><code>${escapeHtml(recencyScore.toString())}</code></pre>`;
        } else if (name === 'nesting') {
             content += `<h3>Logic: Hierarchy Score</h3><pre><code>${escapeHtml(hierarchyScore.toString())}</code></pre>`;
        } else if (name === 'pinned') {
             content += `<h3>Logic: Pinned Score</h3><pre><code>${escapeHtml(pinnedScore.toString())}</code></pre>`;
        }
    } else if (type === 'registry' && name === 'genera') {
        const json = JSON.stringify(GENERA_REGISTRY, null, 2);
        content = `
<h3>Genera Registry Data</h3>
<p>Mapping of domain names to categories.</p>
<pre><code>${escapeHtml(json)}</code></pre>
        `;
    }

    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    modalOverlay.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3>${title}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-content">
                ${content}
            </div>
        </div>
    `;

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

function getEnabledStrategiesFromUI(container: HTMLElement): SortingStrategy[] {
    return Array.from(container.children)
        .filter(row => (row.querySelector('input[type="checkbox"]') as HTMLInputElement).checked)
        .map(row => (row as HTMLElement).dataset.id as SortingStrategy);
}

function runSimulation() {
  const groupingList = document.getElementById('sim-grouping-list');
  const sortingList = document.getElementById('sim-sorting-list');
  const resultContainer = document.getElementById('simResults');

  if (!groupingList || !sortingList || !resultContainer) return;

  const groupingStrats = getEnabledStrategiesFromUI(groupingList);
  const sortingStrats = getEnabledStrategiesFromUI(sortingList);

  // Prepare data
  let tabs = getMappedTabs();

  // 1. Sort
  if (sortingStrats.length > 0) {
    tabs = sortTabs(tabs, sortingStrats);
  }

  // 2. Group
  const groups = groupTabs(tabs, groupingStrats);

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

    if (!groupingList || !sortingList) return;

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
        } else {
            alert("Failed to apply: " + (response.error || 'Unknown error'));
        }
    } catch (e) {
        console.error("Apply failed", e);
        alert("Apply failed: " + e);
    }
}


function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
