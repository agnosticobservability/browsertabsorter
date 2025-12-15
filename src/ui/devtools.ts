import { analyzeTabContext } from "../background/contextAnalysis.js";
import { TabMetadata } from "../shared/types.js";

document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadTabs);
  }

  loadTabs();
});

async function loadTabs() {
  const tabs = await chrome.tabs.query({});
  const tbody = document.querySelector('#tabsTable tbody');
  const totalTabsEl = document.getElementById('totalTabs');

  if (totalTabsEl) {
    totalTabsEl.textContent = tabs.length.toString();
  }

  // Create a map of tab ID to title for parent lookup
  const tabTitles = new Map<number, string>();
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
  let contextMap = new Map<number, string>();
  try {
      contextMap = await analyzeTabContext(mappedTabs);
  } catch (error) {
      console.error("Failed to analyze context", error);
  }

  if (tbody) {
    tbody.innerHTML = ''; // Clear existing rows

    tabs.forEach(tab => {
      const row = document.createElement('tr');

      const parentTitle = tab.openerTabId ? (tabTitles.get(tab.openerTabId) || 'Unknown') : '-';
      const context = (tab.id && contextMap.get(tab.id)) || 'N/A';

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
        <td>${escapeHtml(context)}</td>
        <td>${new Date(tab.lastAccessed || 0).toLocaleString()}</td>
      `;

      tbody.appendChild(row);
    });
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
