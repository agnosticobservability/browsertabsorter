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
import { GroupingStrategy, Preferences, SortingStrategy, TabMetadata, TabGroup } from "../shared/types.js";
import { STRATEGIES, StrategyDefinition } from "../shared/strategyRegistry.js";

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
    } else if (target.matches('.strategy-view-btn')) {
        const type = target.dataset.type;
        const name = target.dataset.name;
        if (type && name) {
            showStrategyDetails(type, name);
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
        lastAccessed: (tab as any).lastAccessed,
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
    const genre = contextResult?.data?.genre || '-';
    let aiContext = 'N/A';
    let cellStyle = '';
    let cellTitle = '';

    if (contextResult) {
        if (contextResult.status === 'RESTRICTED') {
            aiContext = 'Unextractable (restricted)';
            cellStyle = 'color: gray; font-style: italic;';
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
             aiContext = `${contextResult.context}`;
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
      <td>${escapeHtml(genre)}</td>
      <td style="${cellStyle}" title="${escapeHtml(cellTitle)}">
        ${escapeHtml(aiContext)}
        ${contextResult?.data ? ` <button class="context-json-btn" data-tab-id="${tab.id}">View JSON</button>` : ''}
      </td>
      <td>${new Date((tab as any).lastAccessed || 0).toLocaleString()}</td>
      <td>
        <button class="goto-tab-btn" data-tab-id="${tab.id}" data-window-id="${tab.windowId}">Go to Tab</button>
        <button class="close-tab-btn" data-tab-id="${tab.id}" style="background-color: #dc3545; margin-left: 5px;">Close</button>
      </td>
    `;

    tbody.appendChild(row);
  });
}

function renderAlgorithmsView() {
  renderStrategyConfig();

  const groupingRef = document.getElementById('grouping-ref');
  const sortingRef = document.getElementById('sorting-ref');

  if (groupingRef && groupingRef.children.length === 0) {
    const groupings = [
      { name: 'domain', desc: 'Groups tabs by their domain name (e.g. google.com). Subdomains are stripped.' },
      { name: 'topic', desc: 'Groups based on keywords in the title (e.g. Docs, Mail, Chat, Tasks).' },
      { name: 'lineage', desc: 'Groups tabs based on how they were opened (parent/child relationships).' },
      { name: 'context', desc: 'Groups by high-level category (e.g. Work, Entertainment) determined by extraction.' },
      { name: 'age', desc: 'Groups tabs by time buckets (e.g. Today, Yesterday).' }
    ];

    groupingRef.innerHTML = groupings.map(g => `
      <div class="strategy-item">
        <div class="strategy-name">${g.name}</div>
        <div class="strategy-desc">${g.desc}</div>
        <button class="strategy-view-btn" data-type="grouping" data-name="${g.name}">View Logic</button>
      </div>
    `).join('');
  }

  if (sortingRef && sortingRef.children.length === 0) {
    const sortings = [
       { name: 'recency', desc: 'Sorts by last accessed time (most recent first).' },
       { name: 'nesting', desc: 'Sorts based on hierarchy (roots vs children).' },
       { name: 'pinned', desc: 'Keeps pinned tabs at the beginning of the list.' },
       { name: 'title', desc: 'Alphabetical sort by tab title.' },
       { name: 'url', desc: 'Alphabetical sort by tab URL.' },
       { name: 'context', desc: 'Sorts alphabetically by context category.' },
       { name: 'domain', desc: 'Sorts alphabetically by domain.' },
       { name: 'topic', desc: 'Sorts alphabetically by semantic bucket.' },
       { name: 'age', desc: 'Sorts by time bucket.' },
       { name: 'lineage', desc: 'Sorts by parent/child relationship key.' }
    ];

    sortingRef.innerHTML = sortings.map(s => `
      <div class="strategy-item">
        <div class="strategy-name">${s.name}</div>
        <div class="strategy-desc">${s.desc}</div>
        <button class="strategy-view-btn" data-type="sorting" data-name="${s.name}">View Logic</button>
      </div>
    `).join('');
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

  if (groupingList && groupingList.children.length === 0) {
      const groupingStrategies = STRATEGIES.filter(s => s.isGrouping);
      renderStrategyList(groupingList, groupingStrategies, ['domain', 'topic']); // Default enabled
  }

  if (sortingList && sortingList.children.length === 0) {
      const sortingStrategies = STRATEGIES.filter(s => s.isSorting);
      renderStrategyList(sortingList, sortingStrategies, ['pinned', 'recency']); // Default enabled
  }
}

function renderStrategyList(container: HTMLElement, strategies: StrategyDefinition[], defaultEnabled: string[]) {
    container.innerHTML = '';

    // Sort enabled by their index in defaultEnabled
    const enabled = strategies.filter(s => defaultEnabled.includes(s.id));
    enabled.sort((a, b) => defaultEnabled.indexOf(a.id) - defaultEnabled.indexOf(b.id));

    const disabled = strategies.filter(s => !defaultEnabled.includes(s.id));

    // Initial render order: Enabled (ordered) then Disabled
    const ordered = [...enabled, ...disabled];

    ordered.forEach(strategy => {
        const isChecked = defaultEnabled.includes(strategy.id);
        const row = document.createElement('div');
        row.className = `strategy-row ${isChecked ? '' : 'disabled'}`;
        row.dataset.id = strategy.id;

        row.innerHTML = `
            <input type="checkbox" ${isChecked ? 'checked' : ''}>
            <span class="strategy-label">${strategy.label}</span>
            <div class="strategy-reorder">
                <button class="reorder-btn up">▲</button>
                <button class="reorder-btn down">▼</button>
            </div>
        `;

        // Add listeners
        const checkbox = row.querySelector('input[type="checkbox"]');
        checkbox?.addEventListener('change', (e) => {
            const checked = (e.target as HTMLInputElement).checked;
            row.classList.toggle('disabled', !checked);
        });

        row.querySelector('.reorder-btn.up')?.addEventListener('click', () => moveStrategy(row, -1));
        row.querySelector('.reorder-btn.down')?.addEventListener('click', () => moveStrategy(row, 1));

        container.appendChild(row);
    });
}

function moveStrategy(row: HTMLElement, direction: number) {
    const container = row.parentElement;
    if (!container) return;

    if (direction === -1) {
        if (row.previousElementSibling) {
            container.insertBefore(row, row.previousElementSibling);
        }
    } else {
        if (row.nextElementSibling) {
            container.insertBefore(row.nextElementSibling, row);
        }
    }
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
            content = `
<h3>Logic: Grouping Key</h3>
<pre><code>${escapeHtml(groupingKey.toString())}</code></pre>
            `;
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

function runSimulation() {
  const groupingList = document.getElementById('sim-grouping-list');
  const sortingList = document.getElementById('sim-sorting-list');
  const resultContainer = document.getElementById('simResults');

  if (!groupingList || !sortingList || !resultContainer) return;

  // Helper to get enabled strategies in order
  const getStrategies = (container: HTMLElement): SortingStrategy[] => {
      return Array.from(container.children)
          .filter(row => (row.querySelector('input[type="checkbox"]') as HTMLInputElement).checked)
          .map(row => (row as HTMLElement).dataset.id as SortingStrategy);
  };

  const groupingStrats = getStrategies(groupingList);
  const sortingStrats = getStrategies(sortingList);

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


function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
