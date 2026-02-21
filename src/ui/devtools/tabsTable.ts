import { appState, ColumnDefinition } from "./state.js";
import { getSortValue, getCellValue, getMappedTabs, stripHtml } from "./data.js";
import { logInfo } from "../../shared/logger.js";
import { escapeHtml } from "../../shared/utils.js";
import { TabMetadata } from "../../shared/types.js";

export async function loadTabs() {
  logInfo("Loading tabs for DevTools");
  const tabs = await chrome.tabs.query({});
  appState.currentTabs = tabs;

  const totalTabsEl = document.getElementById('totalTabs');
  if (totalTabsEl) {
    totalTabsEl.textContent = tabs.length.toString();
  }

  // Create a map of tab ID to title for parent lookup
  appState.tabTitles.clear();
  tabs.forEach(tab => {
    if (tab.id !== undefined) {
      appState.tabTitles.set(tab.id, tab.title || 'Untitled');
    }
  });

  // Convert to TabMetadata for context analysis
  const mappedTabs: TabMetadata[] = getMappedTabs();

  // Analyze context
  try {
      const response = await chrome.runtime.sendMessage({
          type: "analyzeTabs",
          payload: { tabIds: mappedTabs.map(t => t.id) }
      });
      if (response && response.ok && response.data) {
          appState.currentContextMap = new Map(response.data);
      } else {
          console.warn("Failed to analyze context from background", response?.error);
          appState.currentContextMap.clear();
      }
  } catch (error) {
      console.error("Failed to analyze context", error);
      appState.currentContextMap.clear();
  }

  renderTable();
}

export function renderTable() {
  const tbody = document.querySelector('#tabsTable tbody');
  if (!tbody) return;

  // 1. Filter
  let tabsDisplay = appState.currentTabs.filter(tab => {
      // Global Search
      if (appState.globalSearchQuery) {
          const q = appState.globalSearchQuery.toLowerCase();
          const searchableText = `${tab.title} ${tab.url} ${tab.id}`.toLowerCase();
          if (!searchableText.includes(q)) return false;
      }

      // Column Filters
      for (const [key, filter] of Object.entries(appState.columnFilters)) {
          if (!filter) continue;
          const val = String(getSortValue(tab, key)).toLowerCase();
          if (!val.includes(filter.toLowerCase())) return false;
      }

      return true;
  });

  // 2. Sort
  if (appState.sortKey) {
    tabsDisplay.sort((a, b) => {
      let valA: any = getSortValue(a, appState.sortKey!);
      let valB: any = getSortValue(b, appState.sortKey!);

      if (valA < valB) return appState.sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return appState.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  tbody.innerHTML = ''; // Clear existing rows

  // 3. Render
  const visibleCols = appState.columns.filter(c => c.visible);

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

export function renderColumnsMenu() {
    const menu = document.getElementById('columnsMenu');
    if (!menu) return;

    menu.innerHTML = appState.columns.map(col => `
        <label class="column-toggle">
            <input type="checkbox" data-key="${col.key}" ${col.visible ? 'checked' : ''}>
            ${escapeHtml(col.label)}
        </label>
    `).join('');

    menu.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', (e) => {
            const key = (e.target as HTMLInputElement).dataset.key;
            const checked = (e.target as HTMLInputElement).checked;
            const col = appState.columns.find(c => c.key === key);
            if (col) {
                col.visible = checked;
                renderTableHeader(); // Re-render header to add/remove columns
                renderTable(); // Re-render body
            }
        });
    });
}

export function renderTableHeader() {
    const headerRow = document.getElementById('headerRow');
    const filterRow = document.getElementById('filterRow');
    if (!headerRow || !filterRow) return;

    const visibleCols = appState.columns.filter(c => c.visible);

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
        const val = appState.columnFilters[col.key] || '';
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
                appState.columnFilters[key] = val;
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

export function handleSort(key: string) {
  if (appState.sortKey === key) {
    appState.sortDirection = appState.sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    appState.sortKey = key;
    appState.sortDirection = 'asc';
  }
  updateHeaderStyles();
  renderTable();
}

export function updateHeaderStyles() {
  document.querySelectorAll('th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.getAttribute('data-key') === appState.sortKey) {
      th.classList.add(appState.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

export function initResize(resizer: HTMLElement) {
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
        const col = appState.columns.find(c => c.key === colKey);
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

export function initTabsTable() {
    // Listeners for UI controls
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadTabs);
    }

    const globalSearchInput = document.getElementById('globalSearch') as HTMLInputElement;
    if (globalSearchInput) {
        globalSearchInput.addEventListener('input', (e) => {
            appState.globalSearchQuery = (e.target as HTMLInputElement).value;
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
            // Reset columns to defaults
            appState.columns.forEach(c => c.visible = ['id', 'title', 'url', 'windowId', 'groupId', 'genre', 'context', 'siteName', 'platform', 'objectType', 'authorOrCreator', 'actions'].includes(c.key));
            appState.globalSearchQuery = '';
            if (globalSearchInput) globalSearchInput.value = '';
            appState.columnFilters = {};
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
    // We can put these listeners here or in the main entry point.
    // Putting them here isolates tab table logic.
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.url || changeInfo.status === 'complete') {
            loadTabs();
        }
    });

    chrome.tabs.onRemoved.addListener(() => {
        loadTabs();
    });

    renderTableHeader();
}
