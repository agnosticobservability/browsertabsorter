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
import { GroupingStrategy, Preferences, SortingStrategy, TabMetadata, TabGroup, CustomStrategy, StrategyRule } from "../shared/types.js";
import { STRATEGIES, StrategyDefinition, getStrategies } from "../shared/strategyRegistry.js";

// State
let currentTabs: chrome.tabs.Tab[] = [];
let localCustomStrategies: CustomStrategy[] = [];
let currentContextMap = new Map<number, ContextResult>();
let tabTitles = new Map<number, string>();
let sortKey: string | null = null;
let sortDirection: 'asc' | 'desc' = 'asc';

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
  await loadPreferencesAndInit(); // Load preferences first to init strategies
  renderAlgorithmsView();
  loadCustomGenera();
  initStrategyEditor();
});

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

function initStrategyEditor() {
    const addRuleBtn = document.getElementById('add-rule-btn');
    const saveStratBtn = document.getElementById('save-strat-btn');
    const rulesList = document.getElementById('rules-list');

    if (addRuleBtn) {
        addRuleBtn.addEventListener('click', () => {
             addRuleRow();
        });
    }

    if (saveStratBtn) {
        saveStratBtn.addEventListener('click', saveCustomStrategy);
    }

    renderStrategiesList();
}

function addRuleRow(data?: StrategyRule) {
    const rulesList = document.getElementById('rules-list');
    if (!rulesList) return;

    const div = document.createElement('div');
    div.className = 'rule-row';
    div.style.display = 'flex';
    div.style.gap = '5px';
    div.style.marginBottom = '5px';

    div.innerHTML = `
        <select class="rule-field">
            <option value="url">URL</option>
            <option value="title">Title</option>
            <option value="domain">Domain</option>
        </select>
        <select class="rule-operator">
            <option value="contains">Contains</option>
            <option value="equals">Equals</option>
            <option value="startsWith">Starts With</option>
            <option value="endsWith">Ends With</option>
            <option value="matches">Matches Regex</option>
        </select>
        <input type="text" class="rule-value" placeholder="Pattern" style="flex: 1;">
        <span>&rarr;</span>
        <input type="text" class="rule-result" placeholder="Group Name" style="flex: 1;">
        <button class="remove-rule-btn" style="color: red;">&times;</button>
    `;

    if (data) {
        (div.querySelector('.rule-field') as HTMLSelectElement).value = data.field;
        (div.querySelector('.rule-operator') as HTMLSelectElement).value = data.operator;
        (div.querySelector('.rule-value') as HTMLInputElement).value = data.value;
        (div.querySelector('.rule-result') as HTMLInputElement).value = data.result;
    }

    div.querySelector('.remove-rule-btn')?.addEventListener('click', () => {
        div.remove();
    });

    rulesList.appendChild(div);
}

async function saveCustomStrategy() {
    const idInput = document.getElementById('new-strat-id') as HTMLInputElement;
    const labelInput = document.getElementById('new-strat-label') as HTMLInputElement;
    const rulesList = document.getElementById('rules-list');

    if (!idInput || !labelInput || !rulesList) return;

    const id = idInput.value.trim();
    const label = labelInput.value.trim();

    if (!id || !label) {
        alert("Please enter ID and Label");
        return;
    }

    const rules: StrategyRule[] = [];
    rulesList.querySelectorAll('.rule-row').forEach(row => {
        const field = (row.querySelector('.rule-field') as HTMLSelectElement).value as any;
        const operator = (row.querySelector('.rule-operator') as HTMLSelectElement).value as any;
        const value = (row.querySelector('.rule-value') as HTMLInputElement).value;
        const result = (row.querySelector('.rule-result') as HTMLInputElement).value;

        if (value && result) {
            rules.push({ field, operator, value, result });
        }
    });

    if (rules.length === 0) {
        alert("Please add at least one valid rule.");
        return;
    }

    const newStrategy: CustomStrategy = {
        id,
        label,
        type: 'grouping', // Default to grouping for now
        rules
    };

    try {
        // Fetch current to merge
        const response = await chrome.runtime.sendMessage({ type: 'loadPreferences' });
        if (response && response.ok && response.data) {
            const prefs = response.data as Preferences;
            let currentStrategies = prefs.customStrategies || [];

            // Remove existing if same ID
            currentStrategies = currentStrategies.filter(s => s.id !== id);
            currentStrategies.push(newStrategy);

            await chrome.runtime.sendMessage({
                type: 'savePreferences',
                payload: { customStrategies: currentStrategies }
            });

            // Update local state
            localCustomStrategies = currentStrategies;
            setCustomStrategies(localCustomStrategies);

            // Reset form
            idInput.value = '';
            labelInput.value = '';
            rulesList.innerHTML = '';

            renderStrategiesList();
            renderAlgorithmsView(); // Refresh algo lists
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
                // Populate form
                (document.getElementById('new-strat-id') as HTMLInputElement).value = strat.id;
                (document.getElementById('new-strat-label') as HTMLInputElement).value = strat.label;
                const rulesList = document.getElementById('rules-list');
                if (rulesList) {
                    rulesList.innerHTML = '';
                    strat.rules.forEach(r => addRuleRow(r));
                }
                document.querySelector('.strategy-editor')?.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    container.querySelectorAll('.override-strat-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = (e.target as HTMLElement).dataset.id;
            const label = (e.target as HTMLElement).dataset.label;

            // Populate form
            (document.getElementById('new-strat-id') as HTMLInputElement).value = id || '';
            (document.getElementById('new-strat-label') as HTMLInputElement).value = label || '';

            // Clear rules
            const rulesList = document.getElementById('rules-list');
            if (rulesList) rulesList.innerHTML = '';

            // Add one empty rule to start
            addRuleRow();

            // Scroll to editor
            document.querySelector('.strategy-editor')?.scrollIntoView({ behavior: 'smooth' });
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
