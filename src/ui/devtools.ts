import { analyzeTabContext, ContextResult } from "../background/contextAnalysis.js";
import { Preferences, TabMetadata } from "../shared/types.js";

// State
let currentTabs: chrome.tabs.Tab[] = [];
let currentContextMap = new Map<number, ContextResult>();
let tabTitles = new Map<number, string>();
let sortKey: string | null = null;
let sortDirection: 'asc' | 'desc' = 'asc';

document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadTabs);
  }

  const popupVariantSelect = document.getElementById('popupVariant') as HTMLSelectElement;
  if (popupVariantSelect) {
    // Load initial preference
    chrome.runtime.sendMessage({ type: "loadPreferences" }, (response) => {
      if (response && response.ok && response.data) {
        const prefs = response.data as Preferences;
        popupVariantSelect.value = prefs.popupVariant || "default";
      }
    });

    // Save on change
    popupVariantSelect.addEventListener('change', () => {
       const variant = popupVariantSelect.value;
       chrome.runtime.sendMessage({
         type: "savePreferences",
         payload: { popupVariant: variant }
       });
    });
  }

  // Add sort listeners
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-key');
      if (key) {
        handleSort(key);
      }
    });
  });

  loadTabs();
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
  const mappedTabs: TabMetadata[] = tabs
    .filter((tab): tab is chrome.tabs.Tab & { id: number; windowId: number; url: string; title: string } =>
      !!tab.id && !!tab.windowId && !!tab.url && !!tab.title
    )
    .map(tab => ({
      id: tab.id,
      windowId: tab.windowId,
      title: tab.title,
      url: tab.url,
      pinned: !!tab.pinned,
      lastAccessed: tab.lastAccessed,
      openerTabId: tab.openerTabId,
      favIconUrl: tab.favIconUrl || undefined
    }));

  // Analyze context
  try {
      currentContextMap = await analyzeTabContext(mappedTabs);
  } catch (error) {
      console.error("Failed to analyze context", error);
      currentContextMap.clear();
  }

  renderTable();
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

  let tabsDisplay = [...currentTabs];

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

  tabsDisplay.forEach(tab => {
    const row = document.createElement('tr');

    const parentTitle = tab.openerTabId ? (tabTitles.get(tab.openerTabId) || 'Unknown') : '-';

    const contextResult = tab.id ? currentContextMap.get(tab.id) : undefined;

    let displayContext = 'N/A';
    let tooltip = '';

    if (contextResult) {
        if (contextResult.source === 'Extraction') {
             displayContext = `Extracted (${contextResult.context})`;
        } else if (contextResult.source === 'AI') {
             displayContext = `AI (${contextResult.context})`;
        } else if (contextResult.source === 'Error') {
             displayContext = `Error (${contextResult.context})`;
        } else if (contextResult.source === 'Heuristic') {
             displayContext = `Fallback (${contextResult.context})`;
        } else {
             displayContext = contextResult.context;
        }

        if (contextResult.data) {
             tooltip = JSON.stringify(contextResult.data, null, 2);
             displayContext += ' 📄';
        }
        if (contextResult.error) {
             const errStr = `Error: ${contextResult.error}`;
             tooltip = tooltip ? `${tooltip}\n\n${errStr}` : errStr;
             if (!contextResult.data) displayContext += ' ⚠️';
        }
    }

    row.innerHTML = `
      <td>${tab.id ?? 'N/A'}</td>
      <td>${tab.index}</td>
      <td>${tab.windowId}</td>
      <td>${tab.groupId}</td>
      <td class="title-cell" title="${escapeHtml(tab.title || '')}">${escapeHtml(tab.title || '')}</td>
      <td class="url-cell" title="${escapeHtml(tab.url || '')}">${escapeHtml(tab.url || '')}</td>
      <td>${tab.status}</td>
      <td>${tab.active ? 'Yes' : 'No'}</td>
      <td>${tab.pinned ? 'Yes' : 'No'}</td>
      <td>${tab.openerTabId ?? '-'}</td>
      <td title="${escapeHtml(parentTitle)}">${escapeHtml(parentTitle)}</td>
      <td title="${escapeHtml(tooltip)}">${escapeHtml(displayContext)}</td>
      <td>${new Date(tab.lastAccessed || 0).toLocaleString()}</td>
    `;

    tbody.appendChild(row);
  });
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
