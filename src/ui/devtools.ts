import { analyzeTabContext, ContextResult } from "../background/contextAnalysis.js";
import { groupTabs } from "../background/groupingStrategies.js";
import { sortTabs } from "../background/sortingStrategies.js";
import { GroupingStrategy, Preferences, SortingStrategy, TabMetadata, TabGroup } from "../shared/types.js";

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

  // Add sort listeners
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-key');
      if (key) {
        handleSort(key);
      }
    });
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
    }
  });

  loadTabs();
  // Pre-render static content
  renderAlgorithmsView();
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
        lastAccessed: tab.lastAccessed,
        openerTabId: tab.openerTabId,
        favIconUrl: tab.favIconUrl || undefined,
        context: contextResult?.context,
        contextData: contextResult?.data
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
    let aiContext = 'N/A';
    let cellStyle = '';
    let cellTitle = '';

    if (contextResult) {
        if (contextResult.status === 'RESTRICTED') {
            aiContext = 'Unextractable (restricted)';
            cellStyle = 'color: gray; font-style: italic;';
            cellTitle = contextResult.error || '';
        } else if (contextResult.status === 'INJECTION_FAILED') {
            aiContext = 'Injection Failed';
            cellStyle = 'color: orange;';
            cellTitle = contextResult.error || '';
        } else if (contextResult.status === 'NO_RESPONSE') {
            aiContext = 'No extractable data';
            cellStyle = 'color: gray;';
            cellTitle = contextResult.error || '';
        } else if (contextResult.error) {
            aiContext = `Error (${contextResult.error})`;
            cellStyle = 'color: red;';
            cellTitle = contextResult.error;
        } else if (contextResult.source === 'Extraction') {
            aiContext = `${contextResult.context} (Extracted)`;
            cellStyle = 'color: green; font-weight: bold;';
        } else if (contextResult.source === 'AI') {
            aiContext = `${contextResult.context} (AI)`;
        } else if (contextResult.source === 'Heuristic') {
             aiContext = `Fallback (${contextResult.context})`;
        }
    }

    // Add data tooltip for debugging
    if (contextResult && contextResult.data) {
        cellTitle += '\n' + JSON.stringify(contextResult.data, null, 2);
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
      <td style="${cellStyle}" title="${escapeHtml(cellTitle)}">
        ${escapeHtml(aiContext)}
        ${contextResult?.data ? ` <button class="context-json-btn" data-tab-id="${tab.id}">View JSON</button>` : ''}
      </td>
      <td>${new Date(tab.lastAccessed || 0).toLocaleString()}</td>
      <td>
        <button class="goto-tab-btn" data-tab-id="${tab.id}" data-window-id="${tab.windowId}">Go to Tab</button>
        <button class="close-tab-btn" data-tab-id="${tab.id}" style="background-color: #dc3545; margin-left: 5px;">Close</button>
      </td>
    `;

    tbody.appendChild(row);
  });
}

function renderAlgorithmsView() {
  const groupingRef = document.getElementById('grouping-ref');
  const sortingRef = document.getElementById('sorting-ref');

  if (groupingRef && groupingRef.innerHTML.trim() === '') {
    const groupings = [
      { name: 'domain', desc: 'Groups tabs by their domain name (e.g. google.com). Subdomains are stripped.' },
      { name: 'semantic', desc: 'Groups based on keywords in the title (e.g. Docs, Mail, Chat, Tasks).' },
      { name: 'navigation', desc: 'Groups tabs based on how they were opened (parent/child relationships).' },
      { name: 'context', desc: 'Groups by high-level category (e.g. Work, Entertainment) determined by extraction.' }
    ];

    groupingRef.innerHTML = groupings.map(g => `
      <div class="strategy-item">
        <div class="strategy-name">${g.name}</div>
        <div class="strategy-desc">${g.desc}</div>
      </div>
    `).join('');
  }

  if (sortingRef && sortingRef.innerHTML.trim() === '') {
    const sortings = [
       { name: 'recency', desc: 'Sorts by last accessed time (most recent first).' },
       { name: 'hierarchy', desc: 'Keeps child tabs adjacent to their parents.' },
       { name: 'pinned', desc: 'Keeps pinned tabs at the beginning of the list.' },
       { name: 'title', desc: 'Alphabetical sort by tab title.' },
       { name: 'url', desc: 'Alphabetical sort by tab URL.' },
       { name: 'context', desc: 'Sorts alphabetically by context category.' }
    ];

    sortingRef.innerHTML = sortings.map(s => `
      <div class="strategy-item">
        <div class="strategy-name">${s.name}</div>
        <div class="strategy-desc">${s.desc}</div>
      </div>
    `).join('');
  }
}

function runSimulation() {
  const primaryEl = document.getElementById('sim-primary') as HTMLSelectElement;
  const secondaryEl = document.getElementById('sim-secondary') as HTMLSelectElement;
  const sortingEl = document.getElementById('sim-sorting') as HTMLInputElement;
  const resultContainer = document.getElementById('simResults');

  if (!primaryEl || !secondaryEl || !sortingEl || !resultContainer) return;

  const primary = primaryEl.value as GroupingStrategy;
  const secondary = secondaryEl.value as GroupingStrategy;
  const sortingInput = sortingEl.value;

  const sorting = sortingInput.split(',')
    .map(s => s.trim())
    .filter(s => s) as SortingStrategy[];

  // Prepare data
  let tabs = getMappedTabs();

  // 1. Sort
  tabs = sortTabs(tabs, sorting);

  // 2. Group
  const groups = groupTabs(tabs, primary, secondary);

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


function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
