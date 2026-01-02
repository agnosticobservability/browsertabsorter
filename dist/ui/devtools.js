import { analyzeTabContext } from "../background/contextAnalysis.js";
// State
let currentTabs = [];
let currentContextMap = new Map();
let tabTitles = new Map();
let sortKey = null;
let sortDirection = 'asc';
document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadTabs);
    }
    const popupVariantSelect = document.getElementById('popupVariant');
    if (popupVariantSelect) {
        // Load initial preference
        chrome.runtime.sendMessage({ type: "loadPreferences" }, (response) => {
            if (response && response.ok && response.data) {
                const prefs = response.data;
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
    // Listen for tab updates to refresh data (SPA support)
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        // We update if URL changes or status changes to complete
        if (changeInfo.url || changeInfo.status === 'complete') {
            loadTabs();
        }
    });
    document.addEventListener('click', (event) => {
        const target = event.target;
        if (!target || !target.matches('.context-json-btn'))
            return;
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
    const mappedTabs = tabs
        .filter((tab) => !!tab.id && !!tab.windowId && !!tab.url && !!tab.title)
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
    }
    catch (error) {
        console.error("Failed to analyze context", error);
        currentContextMap.clear();
    }
    renderTable();
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
    let tabsDisplay = [...currentTabs];
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
            }
            else if (contextResult.status === 'INJECTION_FAILED') {
                aiContext = 'Injection Failed';
                cellStyle = 'color: orange;';
                cellTitle = contextResult.error || '';
            }
            else if (contextResult.status === 'NO_RESPONSE') {
                aiContext = 'No extractable data';
                cellStyle = 'color: gray;';
                cellTitle = contextResult.error || '';
            }
            else if (contextResult.error) {
                aiContext = `Error (${contextResult.error})`;
                cellStyle = 'color: red;';
                cellTitle = contextResult.error;
            }
            else if (contextResult.source === 'Extraction') {
                aiContext = `${contextResult.context} (Extracted)`;
                cellStyle = 'color: green; font-weight: bold;';
            }
            else if (contextResult.source === 'AI') {
                aiContext = `${contextResult.context} (AI)`;
            }
            else if (contextResult.source === 'Heuristic') {
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
    `;
        tbody.appendChild(row);
    });
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
