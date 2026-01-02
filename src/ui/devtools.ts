import { analyzeTabContext, ContextResult } from "../background/contextAnalysis.js";
import { Preferences, TabMetadata } from "../shared/types.js";

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
  let contextMap = new Map<number, ContextResult>();
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

      const contextResult = tab.id ? contextMap.get(tab.id) : undefined;
      const effectiveContext = contextResult ? contextResult.context : 'N/A';

      let aiContext = 'N/A';
      if (contextResult && contextResult.source === 'AI') {
          aiContext = contextResult.context;
      } else if (contextResult && contextResult.source === 'Heuristic') {
          aiContext = `Fallback (${contextResult.context})`;
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
        <td>${escapeHtml(effectiveContext)}</td>
        <td>${escapeHtml(aiContext)}</td>
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
