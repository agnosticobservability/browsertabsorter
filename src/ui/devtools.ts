import { analyzeTabContext, ContextResult } from "../background/contextAnalysis.js";
import {
  groupTabs,
  domainFromUrl,
  semanticBucket,
  navigationKey,
  groupingKey
} from "../background/groupingStrategies.js";
import { GENERA_REGISTRY } from "../background/extraction/generaRegistry.js";
import {
  sortTabs,
  recencyScore,
  hierarchyScore,
  pinnedScore,
  compareBy
} from "../background/sortingStrategies.js";
import { setCustomStrategies } from "../background/groupingStrategies.js";
import { GroupingStrategy, Preferences, SortingStrategy, TabMetadata, TabGroup, CustomStrategy, StrategyRule, RuleCondition, GroupingRule, SortingRule } from "../shared/types.js";
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
  initStrategyBuilder();
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

// ---------------------- STRATEGY BUILDER ----------------------

const FIELD_OPTIONS = `
                <optgroup label="Standard Fields">
                    <option value="url">URL</option>
                    <option value="title">Title</option>
                    <option value="domain">Domain</option>
                    <option value="id">ID</option>
                    <option value="index">Index</option>
                    <option value="windowId">Window ID</option>
                    <option value="groupId">Group ID</option>
                    <option value="active">Active</option>
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

function initStrategyBuilder() {
    const addFilterGroupBtn = document.getElementById('add-filter-group-btn');
    const addGroupBtn = document.getElementById('add-group-btn');
    const addSortBtn = document.getElementById('add-sort-btn');

    // New: Group Sorting
    const addGroupSortBtn = document.getElementById('add-group-sort-btn');
    const groupSortCheck = document.getElementById('strat-sortgroups-check');

    const saveBtn = document.getElementById('builder-save-btn');
    const runBtn = document.getElementById('builder-run-btn');

    if (addFilterGroupBtn) addFilterGroupBtn.addEventListener('click', () => addFilterGroupRow());
    if (addGroupBtn) addGroupBtn.addEventListener('click', () => addBuilderRow('group'));
    if (addSortBtn) addSortBtn.addEventListener('click', () => addBuilderRow('sort'));
    if (addGroupSortBtn) addGroupSortBtn.addEventListener('click', () => addBuilderRow('groupSort'));

    if (groupSortCheck) {
        groupSortCheck.addEventListener('change', (e) => {
            const checked = (e.target as HTMLInputElement).checked;
            const container = document.getElementById('group-sort-rows-container');
            const addBtn = document.getElementById('add-group-sort-btn');
            if (container && addBtn) {
                container.style.display = checked ? 'block' : 'none';
                addBtn.style.display = checked ? 'block' : 'none';
            }
        });
    }

    if (saveBtn) saveBtn.addEventListener('click', saveCustomStrategyFromBuilder);
    if (runBtn) runBtn.addEventListener('click', runBuilderSimulation);

    // Initial Live View
    renderLiveView();
    const refreshLiveBtn = document.getElementById('refresh-live-view-btn');
    if (refreshLiveBtn) refreshLiveBtn.addEventListener('click', renderLiveView);

    renderStrategiesList();
}

function addFilterGroupRow(conditions?: RuleCondition[]) {
    const container = document.getElementById('filter-rows-container');
    if (!container) return;

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

    const conditionsContainer = groupDiv.querySelector('.conditions-container') as HTMLElement;
    const addConditionBtn = groupDiv.querySelector('.btn-add-condition');

    const addCondition = (data?: RuleCondition) => {
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
            <select class="operator-select">
                <option value="contains">contains</option>
                <option value="doesNotContain">does not contain</option>
                <option value="matches">matches regex</option>
                <option value="equals">equals</option>
                <option value="startsWith">starts with</option>
                <option value="endsWith">ends with</option>
                <option value="exists">exists</option>
                <option value="doesNotExist">does not exist</option>
                <option value="isNull">is null</option>
                <option value="isNotNull">is not null</option>
            </select>
            <input type="text" class="value-input" placeholder="Value">
            <button class="small-btn btn-del-condition" style="background: none; border: none; color: red;">&times;</button>
        `;

        if (data) {
            (div.querySelector('.field-select') as HTMLSelectElement).value = data.field;
            (div.querySelector('.operator-select') as HTMLSelectElement).value = data.operator;
            (div.querySelector('.value-input') as HTMLInputElement).value = data.value;
        }

        div.querySelector('.btn-del-condition')?.addEventListener('click', () => {
            div.remove();
            updateBreadcrumb();
        });

        div.querySelectorAll('input, select').forEach(el => {
            el.addEventListener('change', updateBreadcrumb);
            el.addEventListener('input', updateBreadcrumb);
        });

        conditionsContainer.appendChild(div);
    };

    addConditionBtn?.addEventListener('click', () => addCondition());

    if (conditions && conditions.length > 0) {
        conditions.forEach(c => addCondition(c));
    } else {
        // Add one empty condition by default
        addCondition();
    }

    container.appendChild(groupDiv);
    updateBreadcrumb();
}

function addBuilderRow(type: 'group' | 'sort' | 'groupSort', data?: any) {
    let containerId = '';
    if (type === 'group') containerId = 'group-rows-container';
    else if (type === 'sort') containerId = 'sort-rows-container';
    else if (type === 'groupSort') containerId = 'group-sort-rows-container';

    const container = document.getElementById(containerId);
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'builder-row';
    div.dataset.type = type;

    if (type === 'group') {
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
        const sourceSelect = div.querySelector('.source-select') as HTMLSelectElement;
        const fieldSelect = div.querySelector('.value-input-field') as HTMLElement;
        const textInput = div.querySelector('.value-input-text') as HTMLElement;
        const colorInput = div.querySelector('.color-input') as HTMLSelectElement;
        const randomCheck = div.querySelector('.random-color-check') as HTMLInputElement;

        // Toggle input type
        const toggleInput = () => {
            if (sourceSelect.value === 'field') {
                fieldSelect.style.display = 'inline-block';
                textInput.style.display = 'none';
            } else {
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
            } else {
                colorInput.disabled = false;
                colorInput.style.opacity = '1';
            }
        };
        randomCheck.addEventListener('change', toggleColor);
        toggleColor(); // init

    } else if (type === 'sort' || type === 'groupSort') {
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
            const sourceSelect = div.querySelector('.source-select') as HTMLSelectElement;
            const fieldSelect = div.querySelector('.value-input-field') as HTMLSelectElement;
            const textInput = div.querySelector('.value-input-text') as HTMLInputElement;
            const colorInput = div.querySelector('.color-input') as HTMLSelectElement;
            const randomCheck = div.querySelector('.random-color-check') as HTMLInputElement;

            if (data.source) sourceSelect.value = data.source;

            // Trigger toggle to show correct input
            sourceSelect.dispatchEvent(new Event('change'));

            if (data.source === 'field') {
                if (data.value) fieldSelect.value = data.value;
            } else {
                if (data.value) textInput.value = data.value;
            }

            if (data.color && data.color !== 'random') {
                randomCheck.checked = false;
                colorInput.value = data.color;
            } else {
                randomCheck.checked = true;
            }
             // Trigger toggle color
            randomCheck.dispatchEvent(new Event('change'));
        } else if (type === 'sort' || type === 'groupSort') {
             if (data.field) (div.querySelector('.field-select') as HTMLSelectElement).value = data.field;
             if (data.order) (div.querySelector('.order-select') as HTMLSelectElement).value = data.order;
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

function updateBreadcrumb() {
    const breadcrumb = document.getElementById('strategy-breadcrumb');
    if (!breadcrumb) return;

    let text = 'All';

    // Filters
    const filters = document.getElementById('filter-rows-container')?.querySelectorAll('.builder-row');
    if (filters && filters.length > 0) {
        filters.forEach(row => {
             const field = (row.querySelector('.field-select') as HTMLSelectElement).value;
             const op = (row.querySelector('.operator-select') as HTMLSelectElement).value;
             const val = (row.querySelector('.value-input') as HTMLInputElement).value;
             if (val) text += ` > ${field} ${op} ${val}`;
        });
    }

    // Groups
    const groups = document.getElementById('group-rows-container')?.querySelectorAll('.builder-row');
    if (groups && groups.length > 0) {
        groups.forEach(row => {
             const source = (row.querySelector('.source-select') as HTMLSelectElement).value;
             let val = "";
             if (source === 'field') {
                 val = (row.querySelector('.value-input-field') as HTMLSelectElement).value;
                 text += ` > Group by Field: ${val}`;
             } else {
                 val = (row.querySelector('.value-input-text') as HTMLInputElement).value;
                 text += ` > Group by Name: "${val}"`;
             }
        });
    }

    // Group Sorts
    const groupSorts = document.getElementById('group-sort-rows-container')?.querySelectorAll('.builder-row');
    if (groupSorts && groupSorts.length > 0) {
        groupSorts.forEach(row => {
            const field = (row.querySelector('.field-select') as HTMLSelectElement).value;
            const order = (row.querySelector('.order-select') as HTMLSelectElement).value;
            text += ` > Group sort by ${field} (${order})`;
        });
    }

    // Sorts
    const sorts = document.getElementById('sort-rows-container')?.querySelectorAll('.builder-row');
    if (sorts && sorts.length > 0) {
        sorts.forEach(row => {
             const field = (row.querySelector('.field-select') as HTMLSelectElement).value;
             const order = (row.querySelector('.order-select') as HTMLSelectElement).value;
             text += ` > Sort by ${field} (${order})`;
        });
    }

    breadcrumb.textContent = text;
}

function getBuilderStrategy(): CustomStrategy | null {
    const idInput = document.getElementById('strat-id') as HTMLInputElement;
    const labelInput = document.getElementById('strat-label') as HTMLInputElement;
    const fallbackInput = document.getElementById('strat-fallback') as HTMLInputElement;

    const id = idInput.value.trim();
    const label = labelInput.value.trim();
    const fallback = fallbackInput.value.trim();
    const sortGroups = (document.getElementById('strat-sortgroups-check') as HTMLInputElement).checked;

    if (!id || !label) {
        return null;
    }

    const filters: RuleCondition[] = [];
    document.getElementById('filter-rows-container')?.querySelectorAll('.builder-row').forEach(row => {
        const field = (row.querySelector('.field-select') as HTMLSelectElement).value;
        const operator = (row.querySelector('.operator-select') as HTMLSelectElement).value as any;
        const value = (row.querySelector('.value-input') as HTMLInputElement).value;
        if (value) filters.push({ field, operator, value });
    });

    const groupingRules: GroupingRule[] = [];
    document.getElementById('group-rows-container')?.querySelectorAll('.builder-row').forEach(row => {
        const source = (row.querySelector('.source-select') as HTMLSelectElement).value as "field" | "fixed";
        let value = "";
        if (source === 'field') {
            value = (row.querySelector('.value-input-field') as HTMLSelectElement).value;
        } else {
            value = (row.querySelector('.value-input-text') as HTMLInputElement).value;
        }

        const randomCheck = row.querySelector('.random-color-check') as HTMLInputElement;
        const colorInput = row.querySelector('.color-input') as HTMLSelectElement;

        let color = 'random';
        if (!randomCheck.checked) {
            color = colorInput.value;
        }

        if (value) {
            groupingRules.push({ source, value, color });
        }
    });

    const sortingRules: SortingRule[] = [];
    document.getElementById('sort-rows-container')?.querySelectorAll('.builder-row').forEach(row => {
        const field = (row.querySelector('.field-select') as HTMLSelectElement).value;
        const order = (row.querySelector('.order-select') as HTMLSelectElement).value as any;
        sortingRules.push({ field, order });
    });

    const groupSortingRules: SortingRule[] = [];
    document.getElementById('group-sort-rows-container')?.querySelectorAll('.builder-row').forEach(row => {
        const field = (row.querySelector('.field-select') as HTMLSelectElement).value;
        const order = (row.querySelector('.order-select') as HTMLSelectElement).value as any;
        groupSortingRules.push({ field, order });
    });
    const appliedGroupSortingRules = sortGroups ? groupSortingRules : [];

    return {
        id,
        label,
        filters,
        groupingRules,
        sortingRules,
        groupSortingRules: appliedGroupSortingRules,
        fallback,
        sortGroups
    };
}

function runBuilderSimulation() {
    const strat = getBuilderStrategy();
    const resultContainer = document.getElementById('builder-results');

    // For simulation, we can mock an ID/Label if missing
    const simStrat: CustomStrategy = strat || {
        id: 'sim_temp',
        label: 'Simulation',
        filters: [],
        groupingRules: [],
        sortingRules: [],
        fallback: 'Misc'
    };

    if (!strat) {
        if (!(document.getElementById('strat-id') as HTMLInputElement).value) {
            alert("Please enter an ID to run simulation.");
            return;
        }
    }

    if (!resultContainer) return;

    // Update localCustomStrategies temporarily for Sim
    const originalStrategies = [...localCustomStrategies];

    // Replace or add
    const existingIdx = localCustomStrategies.findIndex(s => s.id === simStrat.id);
    if (existingIdx !== -1) {
        localCustomStrategies[existingIdx] = simStrat;
    } else {
        localCustomStrategies.push(simStrat);
    }
    setCustomStrategies(localCustomStrategies);

    // Run Logic
    let tabs = getMappedTabs();

    // Sort using this strategy?
    // sortTabs expects SortingStrategy[].
    // If we use this strategy for sorting...
    tabs = sortTabs(tabs, [simStrat.id]);

    // Group using this strategy
    const groups = groupTabs(tabs, [simStrat.id]);

    // Restore strategies
    localCustomStrategies = originalStrategies;
    setCustomStrategies(localCustomStrategies);

    // Render Results
     if (groups.length === 0) {
      resultContainer.innerHTML = '<p>No groups created.</p>';
      return;
    }

    resultContainer.innerHTML = groups.map(group => `
    <div class="group-result">
      <div class="group-header" style="border-left: 5px solid ${group.color}">
        <span>${escapeHtml(group.label || 'Ungrouped')}</span>
        <span class="group-meta">${group.tabs.length} tabs</span>
      </div>
      <ul class="group-tabs">
        ${group.tabs.map(tab => `
          <li class="group-tab-item">
            <span class="title-cell" title="${escapeHtml(tab.title)}">${escapeHtml(tab.title)}</span>
          </li>
        `).join('')}
      </ul>
    </div>
  `).join('');
}

async function saveCustomStrategyFromBuilder() {
    const strat = getBuilderStrategy();
    if (!strat) {
        alert("Please fill in ID and Label.");
        return;
    }

    try {
        const response = await chrome.runtime.sendMessage({ type: 'loadPreferences' });
        if (response && response.ok && response.data) {
            const prefs = response.data as Preferences;
            let currentStrategies = prefs.customStrategies || [];

            // Find existing to preserve props (like autoRun)
            const existing = currentStrategies.find(s => s.id === strat.id);
            if (existing) {
                strat.autoRun = existing.autoRun;
                // sortGroups is now handled in builder, but if we wanted to preserve it from hidden state we would do it here.
                // Since it's in the UI, we don't overwrite it from existing unless the UI didn't capture it.
                // But getBuilderStrategy captures it.
            }

            // Remove existing if same ID
            currentStrategies = currentStrategies.filter(s => s.id !== strat.id);
            currentStrategies.push(strat);

            await chrome.runtime.sendMessage({
                type: 'savePreferences',
                payload: { customStrategies: currentStrategies }
            });

            localCustomStrategies = currentStrategies;
            setCustomStrategies(localCustomStrategies);

            renderStrategiesList();
            renderAlgorithmsView();
            alert("Strategy saved!");
        }
    } catch (e) {
        console.error("Failed to save strategy", e);
        alert("Error saving strategy");
    }
}

function renderStrategiesList() {
    const container = document.getElementById('custom-strategies-list');
    if (!container) return;

    // Filter to only user-defined ones from preferences
    const strategies = localCustomStrategies;

    if (strategies.length === 0) {
        container.innerHTML = '<p style="color: #888;">No custom strategies found.</p>';
        return;
    }

    container.innerHTML = strategies.map(s => {
        return `
        <div style="border: 1px solid #ddd; padding: 10px; margin-bottom: 5px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; background-color: #f9faff;">
            <div>
                <strong>${escapeHtml(s.label)}</strong> (${escapeHtml(String(s.id))})
                <div style="font-size: 0.8em; color: #666;">
                    Filters: ${s.filters?.length || 0},
                    Groups: ${s.groupingRules?.length || 0},
                    Sorts: ${s.sortingRules?.length || 0}
                </div>
            </div>
            <div>
                <button class="edit-strat-btn" data-id="${escapeHtml(String(s.id))}">Edit</button>
                <button class="delete-strat-btn" data-id="${escapeHtml(String(s.id))}" style="color: red;">Delete</button>
            </div>
        </div>
        `;
    }).join('');

    container.querySelectorAll('.delete-strat-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = (e.target as HTMLElement).dataset.id;
            if (id && confirm(`Delete strategy "${id}"?`)) {
                await deleteCustomStrategy(id);
            }
        });
    });

    container.querySelectorAll('.edit-strat-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = (e.target as HTMLElement).dataset.id;
            const strat = localCustomStrategies.find(s => s.id === id);
            if (strat) {
                // Populate fields
                (document.getElementById('strat-name') as HTMLInputElement).value = strat.id;
                (document.getElementById('strat-desc') as HTMLInputElement).value = strat.label;

                // Set Sort Groups Checkbox
                const sortGroupsCheck = (document.getElementById('strat-sortgroups-check') as HTMLInputElement);
                const hasGroupSort = !!(strat.groupSortingRules && strat.groupSortingRules.length > 0) || !!strat.sortGroups;
                sortGroupsCheck.checked = hasGroupSort;
                // Trigger change to toggle visibility
                sortGroupsCheck.dispatchEvent(new Event('change'));

                const autoRunCheck = (document.getElementById('strat-autorun') as HTMLInputElement);
                autoRunCheck.checked = !!strat.autoRun;

                // Clear lists
                ['filter-rows-container', 'group-rows-container', 'sort-rows-container', 'group-sort-rows-container'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.innerHTML = '';
                });

                // Populate rows

                // Filters
                if (strat.filterGroups && strat.filterGroups.length > 0) {
                    strat.filterGroups.forEach(g => addFilterGroupRow(g));
                } else if (strat.filters && strat.filters.length > 0) {
                    // Legacy: one group
                    addFilterGroupRow(strat.filters);
                } else {
                    // Empty logic, maybe add empty row?
                    // initStrategyBuilder doesn't add rows by default, so maybe fine.
                }

                strat.groupingRules?.forEach(g => addBuilderRow('group', g));
                strat.sortingRules?.forEach(s => addBuilderRow('sort', s));
                strat.groupSortingRules?.forEach(gs => addBuilderRow('groupSort', gs));

                document.querySelector('#view-strategies')?.scrollIntoView({ behavior: 'smooth' });
                updateBreadcrumb();
            }
        });
    });
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
            renderStrategiesList();
            renderAlgorithmsView();
        }
    } catch (e) {
        console.error("Failed to delete strategy", e);
    }
}

// ... Genera management ... (kept as is)
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
<p><b>Configuration:</b></p>
<pre><code>${escapeHtml(JSON.stringify(custom, null, 2))}</code></pre>
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

async function renderLiveView() {
    const container = document.getElementById('live-view-container');
    if (!container) return;

    // We can use fetchCurrentTabGroups from tabManager logic, but that is backend code.
    // In frontend, we should use chrome.tabs and chrome.tabGroups.

    try {
        const tabs = await chrome.tabs.query({});
        const groups = await chrome.tabGroups.query({});
        const groupMap = new Map(groups.map(g => [g.id, g]));

        const windows = new Set(tabs.map(t => t.windowId));
        const windowIds = Array.from(windows).sort((a, b) => a - b);

        let html = '';

        for (const winId of windowIds) {
            html += `<div style="margin-bottom: 15px;">`;
            html += `<div style="font-weight: bold; padding: 5px; background: #eee; border-radius: 4px;">Window ${winId}</div>`;

            const winTabs = tabs.filter(t => t.windowId === winId);

            // Organize by group
            const winGroups = new Map<number, chrome.tabs.Tab[]>();
            const ungrouped: chrome.tabs.Tab[] = [];

            winTabs.forEach(t => {
                if (t.groupId !== -1) {
                    if (!winGroups.has(t.groupId)) winGroups.set(t.groupId, []);
                    winGroups.get(t.groupId)!.push(t);
                } else {
                    ungrouped.push(t);
                }
            });

            // Render Ungrouped
            if (ungrouped.length > 0) {
                 html += `<div style="margin-left: 10px; margin-top: 5px;">`;
                 html += `<div style="font-size: 0.9em; color: #555;">Ungrouped (${ungrouped.length})</div>`;
                 ungrouped.forEach(t => {
                     html += `<div style="margin-left: 10px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">- ${escapeHtml(t.title || 'Untitled')}</div>`;
                 });
                 html += `</div>`;
            }

            // Render Groups
            for (const [groupId, gTabs] of winGroups) {
                const groupInfo = groupMap.get(groupId);
                const color = groupInfo?.color || 'grey';
                const title = groupInfo?.title || 'Untitled Group';

                html += `<div style="margin-left: 10px; margin-top: 5px; border-left: 3px solid ${color}; padding-left: 5px;">`;
                html += `<div style="font-weight: bold; font-size: 0.9em;">${escapeHtml(title)} (${gTabs.length})</div>`;
                gTabs.forEach(t => {
                     html += `<div style="margin-left: 10px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">- ${escapeHtml(t.title || 'Untitled')}</div>`;
                });
                html += `</div>`;
            }

            html += `</div>`;
        }

        container.innerHTML = html;

    } catch (e) {
        container.innerHTML = `<p style="color:red">Error loading live view: ${e}</p>`;
    }
}
